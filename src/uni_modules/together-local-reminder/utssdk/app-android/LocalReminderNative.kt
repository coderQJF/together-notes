package uts.sdk.modules.togetherLocalReminder

import android.Manifest
import android.app.Activity
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import org.json.JSONObject
import java.util.HashSet

private const val PREFS_NAME = "together_local_reminders"
private const val INDEX_KEY = "scheduled_ids"
private const val RECORD_PREFIX = "reminder:"
private const val CHANNEL_ID = "together_reminders"
private const val CHANNEL_NAME = "小记提醒"
private const val EXTRA_ID = "reminder_id"
private const val DAY_MS = 24L * 60L * 60L * 1000L

private data class ReminderRecord(
    val id: String,
    val title: String,
    val content: String,
    val triggerAt: Long,
    val repeat: String,
    val route: String,
) {
    fun toJson(): String = JSONObject()
        .put("id", id)
        .put("title", title)
        .put("content", content)
        .put("triggerAt", triggerAt)
        .put("repeat", repeat)
        .put("route", route)
        .toString()

    fun nextAfter(now: Long): ReminderRecord? {
        if (triggerAt > now) return this
        val interval = when (repeat) {
            "daily" -> DAY_MS
            "weekly" -> 7L * DAY_MS
            else -> return null
        }
        var next = triggerAt
        while (next <= now) next += interval
        return copy(triggerAt = next)
    }

    companion object {
        fun fromJson(raw: String?): ReminderRecord? = try {
            if (raw.isNullOrBlank()) null else JSONObject(raw).let { json ->
                ReminderRecord(
                    id = json.optString("id").take(200),
                    title = json.optString("title").take(100),
                    content = json.optString("content").take(500),
                    triggerAt = json.optLong("triggerAt"),
                    repeat = json.optString("repeat", "none"),
                    route = json.optString("route").take(500),
                ).takeIf { it.id.isNotBlank() && it.triggerAt > 0L }
            }
        } catch (_: Exception) {
            null
        }
    }
}

object LocalReminderNative {
    @JvmStatic
    fun schedule(
        context: Context,
        id: String,
        title: String,
        content: String,
        triggerAt: Number,
        repeat: String,
        route: String,
    ): Boolean = try {
        val safeRepeat = if (repeat == "daily" || repeat == "weekly") repeat else "none"
        val record = ReminderRecord(
            id = id.trim().take(200),
            title = title.trim().take(100),
            content = content.trim().take(500),
            triggerAt = triggerAt.toLong(),
            repeat = safeRepeat,
            route = route.trim().take(500),
        ).nextAfter(System.currentTimeMillis()) ?: return false
        if (record.id.isBlank()) return false
        saveRecord(context, record)
        scheduleRecord(context, record)
        true
    } catch (_: Exception) {
        false
    }

    @JvmStatic
    fun cancel(context: Context, id: String): Boolean = try {
        cancelAlarm(context, id)
        removeRecord(context, id)
        true
    } catch (_: Exception) {
        false
    }

    @JvmStatic
    fun cancelAll(context: Context): Boolean = try {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val ids = HashSet(prefs.getStringSet(INDEX_KEY, emptySet()) ?: emptySet())
        ids.forEach { cancelAlarm(context, it) }
        val editor = prefs.edit().remove(INDEX_KEY)
        ids.forEach { editor.remove(RECORD_PREFIX + it) }
        editor.apply()
        true
    } catch (_: Exception) {
        false
    }

    @JvmStatic
    fun hasNotificationPermission(context: Context): Boolean =
        Build.VERSION.SDK_INT < 33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    @JvmStatic
    fun requestNotificationPermission(activity: Activity): Boolean {
        if (Build.VERSION.SDK_INT < 33 || hasNotificationPermission(activity)) return true
        activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 42031)
        return false
    }

    @JvmStatic
    fun canScheduleExact(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        return manager.canScheduleExactAlarms()
    }

    @JvmStatic
    fun openExactAlarmSettings(activity: Activity): Boolean = try {
        if (canScheduleExact(activity)) return true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            activity.startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                data = Uri.parse("package:${activity.packageName}")
            })
        }
        false
    } catch (_: Exception) {
        false
    }

    internal fun rescheduleAll(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val ids = HashSet(prefs.getStringSet(INDEX_KEY, emptySet()) ?: emptySet())
        val now = System.currentTimeMillis()
        ids.forEach { id ->
            val original = ReminderRecord.fromJson(prefs.getString(RECORD_PREFIX + id, null))
            val record = when {
                original == null -> null
                original.triggerAt > now -> original
                original.repeat == "none" && now - original.triggerAt <= DAY_MS -> original.copy(triggerAt = now + 2000L)
                else -> original.nextAfter(now)
            }
            if (record == null) removeRecord(context, id)
            else {
                saveRecord(context, record)
                scheduleRecord(context, record)
            }
        }
    }

    internal fun handleAlarm(context: Context, id: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val record = ReminderRecord.fromJson(prefs.getString(RECORD_PREFIX + id, null)) ?: return
        postNotification(context, record)
        val next = when (record.repeat) {
            "daily" -> record.copy(triggerAt = record.triggerAt + DAY_MS).nextAfter(System.currentTimeMillis())
            "weekly" -> record.copy(triggerAt = record.triggerAt + 7L * DAY_MS).nextAfter(System.currentTimeMillis())
            else -> null
        }
        if (next == null) removeRecord(context, id)
        else {
            saveRecord(context, next)
            scheduleRecord(context, next)
        }
    }

    private fun scheduleRecord(context: Context, record: ReminderRecord) {
        val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val operation = alarmPendingIntent(context, record.id)
        when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !manager.canScheduleExactAlarms() ->
                manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, record.triggerAt, operation)
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ->
                manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, record.triggerAt, operation)
            else -> manager.setExact(AlarmManager.RTC_WAKEUP, record.triggerAt, operation)
        }
    }

    private fun cancelAlarm(context: Context, id: String) {
        val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        manager.cancel(alarmPendingIntent(context, id))
    }

    private fun alarmPendingIntent(context: Context, id: String): PendingIntent {
        val intent = Intent(context, ReminderAlarmReceiver::class.java)
            .setAction("${context.packageName}.LOCAL_REMINDER.${id.hashCode()}")
            .putExtra(EXTRA_ID, id)
        return PendingIntent.getBroadcast(
            context,
            id.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun saveRecord(context: Context, record: ReminderRecord) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val ids = HashSet(prefs.getStringSet(INDEX_KEY, emptySet()) ?: emptySet())
        ids.add(record.id)
        prefs.edit()
            .putStringSet(INDEX_KEY, ids)
            .putString(RECORD_PREFIX + record.id, record.toJson())
            .apply()
    }

    private fun removeRecord(context: Context, id: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val ids = HashSet(prefs.getStringSet(INDEX_KEY, emptySet()) ?: emptySet())
        ids.remove(id)
        prefs.edit().putStringSet(INDEX_KEY, ids).remove(RECORD_PREFIX + id).apply()
    }

    private fun postNotification(context: Context, record: ReminderRecord) {
        if (!hasNotificationPermission(context)) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH).apply {
                description = "你在小记中设置的本地提醒"
                enableVibration(true)
                lockscreenVisibility = Notification.VISIBILITY_PRIVATE
            })
        }
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("local_reminder_route", record.route)
            putExtra(EXTRA_ID, record.id)
        }
        val contentIntent = launchIntent?.let {
            PendingIntent.getActivity(
                context,
                record.id.hashCode(),
                it,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }
        val body = record.content.ifBlank { "这是你设置的提醒" }
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, CHANNEL_ID) else Notification.Builder(context)
        builder
            .setSmallIcon(context.applicationInfo.icon)
            .setContentTitle(record.title.ifBlank { "小记提醒" })
            .setContentText(body)
            .setStyle(Notification.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setWhen(System.currentTimeMillis())
            .setShowWhen(true)
            .setCategory(Notification.CATEGORY_REMINDER)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setDefaults(Notification.DEFAULT_ALL)
        if (contentIntent != null) builder.setContentIntent(contentIntent)
        manager.notify(record.id.hashCode() and Int.MAX_VALUE, builder.build())
    }
}

class ReminderAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(EXTRA_ID)?.trim().orEmpty()
        if (id.isNotBlank()) LocalReminderNative.handleAlarm(context.applicationContext, id)
    }
}

class ReminderBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            LocalReminderNative.rescheduleAll(context.applicationContext)
        }
    }
}
