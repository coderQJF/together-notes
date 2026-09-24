package uts.sdk.modules.togetherHomeWidget

import android.app.Activity
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Base64
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import android.widget.ScrollView
import android.widget.TextView
import io.dcloud.uni_modules.together_home_widget.R
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest

private const val PREFS_NAME = "together_home_widget"
private const val NOTES_KEY = "notes_json"
private const val SELECTION_PREFIX = "selection:"
private const val EXTRA_ROUTE = "home_widget_route"
private const val MAX_NOTES = 60
private const val MAX_IMAGES_PER_NOTE = 10
private const val IMAGE_DIRECTORY = "widget-images"

internal data class TogetherWidgetNote(
    val id: String,
    val title: String,
    val content: String,
    val date: String,
    val pinned: Boolean,
    val images: List<String>,
)

internal object TogetherHomeWidgetStore {
    fun replaceNotes(context: Context, raw: String): Boolean {
        return try {
            if (raw.length > 1_000_000) return false
            val source = JSONArray(raw)
            val cleaned = JSONArray()
            for (index in 0 until minOf(source.length(), MAX_NOTES)) {
                val item = source.optJSONObject(index) ?: continue
                val id = item.optString("id").trim().take(200)
                if (id.isBlank()) continue
                val images = JSONArray()
                val sourceImages = item.optJSONArray("images") ?: JSONArray()
                for (imageIndex in 0 until minOf(sourceImages.length(), MAX_IMAGES_PER_NOTE)) {
                    val key = sourceImages.optString(imageIndex).trim().take(160)
                    if (key.isNotBlank() && imageFile(context, key).isFile) images.put(key)
                }
                cleaned.put(JSONObject()
                    .put("id", id)
                    .put("title", item.optString("title").trim().ifBlank { "未命名小记" }.take(100))
                    .put("content", item.optString("content").trim().take(4000))
                    .put("date", item.optString("date").trim().ifBlank { "最近更新" }.take(30))
                    .put("pinned", item.optBoolean("pinned", false))
                    .put("images", images))
            }
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(NOTES_KEY, cleaned.toString())
                .apply()
            val retained = buildSet {
                for (noteIndex in 0 until cleaned.length()) {
                    val images = cleaned.optJSONObject(noteIndex)?.optJSONArray("images") ?: continue
                    for (imageIndex in 0 until images.length()) add(images.optString(imageIndex))
                }
            }
            File(context.filesDir, IMAGE_DIRECTORY).listFiles()?.forEach { file -> if (file.name !in retained) file.delete() }
            true
        } catch (_: Exception) {
            false
        }
    }

    fun clearNotes(context: Context) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .remove(NOTES_KEY)
            .apply()
        File(context.filesDir, IMAGE_DIRECTORY).deleteRecursively()
    }

    fun notes(context: Context): List<TogetherWidgetNote> = try {
        val raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(NOTES_KEY, "[]") ?: "[]"
        val array = JSONArray(raw)
        buildList {
            for (index in 0 until minOf(array.length(), MAX_NOTES)) {
                val item = array.optJSONObject(index) ?: continue
                val id = item.optString("id").trim().take(200)
                if (id.isBlank()) continue
                add(TogetherWidgetNote(
                    id = id,
                    title = item.optString("title").trim().ifBlank { "未命名小记" }.take(100),
                    content = item.optString("content").trim().take(4000),
                    date = item.optString("date").trim().ifBlank { "最近更新" }.take(30),
                    pinned = item.optBoolean("pinned", false),
                    images = buildList {
                        val images = item.optJSONArray("images") ?: JSONArray()
                        for (imageIndex in 0 until minOf(images.length(), MAX_IMAGES_PER_NOTE)) {
                            val key = images.optString(imageIndex).trim().take(160)
                            if (key.isNotBlank() && imageFile(context, key).isFile) add(key)
                        }
                    },
                ))
            }
        }
    } catch (_: Exception) {
        emptyList()
    }

    fun select(context: Context, appWidgetId: Int, noteId: String) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(SELECTION_PREFIX + appWidgetId, noteId)
            .apply()
    }

    fun selected(context: Context, appWidgetId: Int): TogetherWidgetNote? {
        val notes = notes(context)
        val selectedId = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(SELECTION_PREFIX + appWidgetId, "")
        return notes.firstOrNull { it.id == selectedId }
            ?: notes.firstOrNull { it.pinned }
            ?: notes.firstOrNull()
    }

    fun removeSelections(context: Context, appWidgetIds: IntArray) {
        val editor = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
        appWidgetIds.forEach { editor.remove(SELECTION_PREFIX + it) }
        editor.apply()
    }

    private fun imageFile(context: Context, key: String) = File(File(context.filesDir, IMAGE_DIRECTORY), key)

    fun cachedImage(context: Context, noteId: String, attachmentId: String): String {
        val key = imageKey(noteId, attachmentId)
        return if (imageFile(context, key).isFile) key else ""
    }

    fun cacheImage(context: Context, noteId: String, attachmentId: String, imageBase64: String): String {
        return try {
            val key = imageKey(noteId, attachmentId)
            val target = imageFile(context, key)
            if (target.isFile) return key
            val bytes = Base64.decode(imageBase64, Base64.DEFAULT)
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
            var sample = 1
            while (bounds.outWidth / sample > 1600 || bounds.outHeight / sample > 1600) sample *= 2
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return ""
            target.parentFile?.mkdirs()
            FileOutputStream(target).use { output -> bitmap.compress(Bitmap.CompressFormat.JPEG, 84, output) }
            bitmap.recycle()
            key
        } catch (_: Exception) {
            ""
        }
    }

    fun image(context: Context, key: String): Bitmap? = try {
        BitmapFactory.decodeFile(imageFile(context, key).absolutePath)
    } catch (_: Exception) {
        null
    }

    private fun imageKey(noteId: String, attachmentId: String): String {
        val bytes = MessageDigest.getInstance("SHA-256").digest("$noteId:$attachmentId".toByteArray())
        return bytes.joinToString("") { "%02x".format(it) } + ".jpg"
    }
}

internal object TogetherHomeWidgetRenderer {
    fun updateAll(context: Context) {
        val manager = AppWidgetManager.getInstance(context)
        val provider = ComponentName(context, TogetherNoteWidgetProvider::class.java)
        manager.getAppWidgetIds(provider).forEach { update(context, manager, it) }
    }

    fun update(context: Context, manager: AppWidgetManager, appWidgetId: Int) {
        val note = TogetherHomeWidgetStore.selected(context, appWidgetId)
        val views = RemoteViews(context.packageName, R.layout.together_note_widget)
        if (note == null) {
            views.setTextViewText(R.id.together_widget_title, "小记")
            views.setTextViewText(R.id.together_widget_body, "打开 App 同步小记后，长按卡片选择要展示的内容。")
            views.setTextViewText(R.id.together_widget_date, "桌面小工具")
            views.setViewVisibility(R.id.together_widget_pin, View.GONE)
            views.setViewVisibility(R.id.together_widget_images, View.GONE)
            views.setViewVisibility(R.id.together_widget_body, View.VISIBLE)
            views.setContentDescription(android.R.id.background, "打开小记")
        } else {
            views.setTextViewText(R.id.together_widget_title, note.title)
            views.setTextViewText(R.id.together_widget_body, note.content.ifBlank { "暂无正文" })
            views.setTextViewText(R.id.together_widget_date, note.date)
            views.setViewVisibility(R.id.together_widget_pin, if (note.pinned) View.VISIBLE else View.GONE)
            views.setViewVisibility(R.id.together_widget_images, if (note.images.isEmpty()) View.GONE else View.VISIBLE)
            views.setViewVisibility(R.id.together_widget_body, if (note.images.isEmpty()) View.VISIBLE else View.GONE)
            views.setContentDescription(android.R.id.background, "${note.title}，打开小记详情")
        }
        val imageIntent = Intent(context, TogetherWidgetImageService::class.java).apply {
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
            data = Uri.parse("together-notes://widget/images/$appWidgetId/${note?.id.orEmpty().hashCode()}")
        }
        views.setRemoteAdapter(R.id.together_widget_images, imageIntent)
        val options = manager.getAppWidgetOptions(appWidgetId)
        val minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110)
        views.setInt(R.id.together_widget_body, "setMaxLines", when {
            minHeight < 100 -> 2
            minHeight < 145 -> 4
            else -> 7
        })
        launchPendingIntent(context, appWidgetId, note)?.let {
            views.setOnClickPendingIntent(android.R.id.background, it)
        }
        manager.updateAppWidget(appWidgetId, views)
        manager.notifyAppWidgetViewDataChanged(appWidgetId, R.id.together_widget_images)
    }

    private fun launchPendingIntent(context: Context, appWidgetId: Int, note: TogetherWidgetNote?): PendingIntent? {
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        if (note != null) {
            intent.putExtra(EXTRA_ROUTE, "/pages/detail/detail?id=${Uri.encode(note.id)}")
            intent.data = Uri.parse("together-notes://widget/note/${Uri.encode(note.id)}")
        } else {
            intent.data = Uri.parse("together-notes://widget/home")
        }
        return PendingIntent.getActivity(
            context,
            appWidgetId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}

object TogetherHomeWidgetNative {
    @JvmStatic
    fun syncNotes(context: Context, notesJson: String): Boolean {
        val saved = TogetherHomeWidgetStore.replaceNotes(context, notesJson)
        if (saved) TogetherHomeWidgetRenderer.updateAll(context)
        return saved
    }

    @JvmStatic
    fun cachedImage(context: Context, noteId: String, attachmentId: String): String = TogetherHomeWidgetStore.cachedImage(context, noteId, attachmentId)

    @JvmStatic
    fun cacheImage(context: Context, noteId: String, attachmentId: String, imageBase64: String): String = TogetherHomeWidgetStore.cacheImage(context, noteId, attachmentId, imageBase64)

    @JvmStatic
    fun clearNotes(context: Context): Boolean = try {
        TogetherHomeWidgetStore.clearNotes(context)
        TogetherHomeWidgetRenderer.updateAll(context)
        true
    } catch (_: Exception) {
        false
    }

    @JvmStatic
    fun isPinSupported(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
        return AppWidgetManager.getInstance(context).isRequestPinAppWidgetSupported
    }

    @JvmStatic
    fun requestPin(activity: Activity): Boolean {
        return try {
            if (!isPinSupported(activity)) return false
            AppWidgetManager.getInstance(activity).requestPinAppWidget(
                ComponentName(activity, TogetherNoteWidgetProvider::class.java),
                null,
                null,
            )
        } catch (_: Exception) {
            false
        }
    }

    @JvmStatic
    fun consumeRoute(activity: Activity): String {
        val route = activity.intent?.getStringExtra(EXTRA_ROUTE).orEmpty().take(500)
        if (route.isNotBlank()) activity.intent?.removeExtra(EXTRA_ROUTE)
        return route
    }
}

class TogetherWidgetImageService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
        return TogetherWidgetImageFactory(applicationContext, intent)
    }
}

private class TogetherWidgetImageFactory(
    private val context: Context,
    intent: Intent,
) : RemoteViewsService.RemoteViewsFactory {
    private val appWidgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
    private var images: List<String> = emptyList()

    override fun onCreate() { refresh() }
    override fun onDataSetChanged() { refresh() }
    override fun onDestroy() { images = emptyList() }
    override fun getCount(): Int = images.size
    override fun getViewAt(position: Int): RemoteViews? {
        val key = images.getOrNull(position) ?: return null
        val bitmap = TogetherHomeWidgetStore.image(context, key) ?: return null
        return RemoteViews(context.packageName, R.layout.together_widget_image).apply {
            setImageViewBitmap(R.id.together_widget_image, bitmap)
        }
    }
    override fun getLoadingView(): RemoteViews? = null
    override fun getViewTypeCount(): Int = 1
    override fun getItemId(position: Int): Long = position.toLong()
    override fun hasStableIds(): Boolean = true

    private fun refresh() {
        images = if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) emptyList()
        else TogetherHomeWidgetStore.selected(context, appWidgetId)?.images.orEmpty()
    }
}

class TogetherNoteWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
        appWidgetIds.forEach { TogetherHomeWidgetRenderer.update(context, manager, it) }
    }

    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
        TogetherHomeWidgetRenderer.update(context, manager, appWidgetId)
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        TogetherHomeWidgetStore.removeSelections(context, appWidgetIds)
    }
}

class TogetherNoteWidgetConfigureActivity : Activity() {
    private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setResult(RESULT_CANCELED)
        appWidgetId = intent?.getIntExtra(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID,
        ) ?: AppWidgetManager.INVALID_APPWIDGET_ID
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }
        window.statusBarColor = Color.parseColor("#FAF8F2")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
        }
        setContentView(buildContent())
    }

    private fun buildContent(): View {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(24), dp(24), dp(24))
            setBackgroundColor(Color.parseColor("#FAF8F2"))
        }
        root.addView(TextView(this).apply {
            text = "选择卡片内容"
            setTextColor(Color.parseColor("#3E382D"))
            textSize = 25f
            typeface = Typeface.DEFAULT_BOLD
        })
        root.addView(TextView(this).apply {
            text = "卡片内容只缓存在这台设备。以后长按桌面卡片，可再次进入这里更换。"
            setTextColor(Color.parseColor("#786D5B"))
            textSize = 14f
            setLineSpacing(0f, 1.45f)
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(8)
            bottomMargin = dp(16)
        })

        val notes = TogetherHomeWidgetStore.notes(this)
        if (notes.isEmpty()) {
            root.addView(emptyState(), LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
            return root
        }
        val scroll = ScrollView(this)
        val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        notes.forEach { note -> list.addView(noteCard(note)) }
        scroll.addView(list, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(scroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        return root
    }

    private fun noteCard(note: TogetherWidgetNote): View {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            minimumHeight = dp(76)
            setPadding(dp(16), dp(14), dp(16), dp(14))
            background = roundedBackground("#FFFFFF", "#E5DECE", 18f)
            isClickable = true
            isFocusable = true
            setOnClickListener {
                TogetherHomeWidgetStore.select(this@TogetherNoteWidgetConfigureActivity, appWidgetId, note.id)
                TogetherHomeWidgetRenderer.update(
                    this@TogetherNoteWidgetConfigureActivity,
                    AppWidgetManager.getInstance(this@TogetherNoteWidgetConfigureActivity),
                    appWidgetId,
                )
                finishWithWidget()
            }
            addView(TextView(this@TogetherNoteWidgetConfigureActivity).apply {
                text = note.title
                setTextColor(Color.parseColor("#3E382D"))
                textSize = 17f
                typeface = Typeface.DEFAULT_BOLD
                maxLines = 1
            })
            addView(TextView(this@TogetherNoteWidgetConfigureActivity).apply {
                text = note.content.ifBlank { "暂无正文" }
                setTextColor(Color.parseColor("#786D5B"))
                textSize = 13f
                maxLines = 2
                setLineSpacing(0f, 1.35f)
            }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                topMargin = dp(5)
            })
        }.also {
            it.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = dp(10)
            }
        }
    }

    private fun emptyState(): View {
        return LinearLayout(this).apply {
            gravity = Gravity.CENTER
            orientation = LinearLayout.VERTICAL
            addView(TextView(this@TogetherNoteWidgetConfigureActivity).apply {
                text = "还没有可展示的小记"
                setTextColor(Color.parseColor("#3E382D"))
                textSize = 19f
                typeface = Typeface.DEFAULT_BOLD
                gravity = Gravity.CENTER
            })
            addView(TextView(this@TogetherNoteWidgetConfigureActivity).apply {
                text = "先打开小记完成登录和同步，卡片会自动显示最近的置顶内容。"
                setTextColor(Color.parseColor("#786D5B"))
                textSize = 14f
                gravity = Gravity.CENTER
                setLineSpacing(0f, 1.45f)
            }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                topMargin = dp(8)
            })
            addView(Button(this@TogetherNoteWidgetConfigureActivity).apply {
                text = "打开小记"
                isAllCaps = false
                setTextColor(Color.WHITE)
                textSize = 14f
                background = roundedBackground("#494032", "#494032", 14f)
                setOnClickListener {
                    finishWithWidget()
                    packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
                        launch.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                        startActivity(launch)
                    }
                }
            }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48)).apply {
                topMargin = dp(20)
            })
        }
    }

    private fun finishWithWidget() {
        setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId))
        finish()
    }

    private fun roundedBackground(fill: String, stroke: String, radius: Float): GradientDrawable {
        return GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = dp(radius.toInt()).toFloat()
            setColor(Color.parseColor(fill))
            setStroke(dp(1), Color.parseColor(stroke))
        }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density + 0.5f).toInt()
}
