package uts.sdk.modules.togetherNativeGba

import android.app.Activity
import android.content.Context
import android.content.Intent
import java.io.File

internal object NativeGbaLauncher {
    private const val PREFS = "together_native_gba"
    private const val CLOSED_SESSION = "closed_session"

    fun open(activity: Activity, romPath: String, gameTitle: String, gameIdentity: String, sessionId: String): Boolean {
        val rom = File(romPath)
        if (!rom.isFile || rom.length() <= 0L || sessionId.isBlank()) return false
        return try {
            activity.startActivity(Intent(activity, NativeGbaActivity::class.java).apply {
                putExtra(NativeGbaActivity.EXTRA_ROM_PATH, rom.absolutePath)
                putExtra(NativeGbaActivity.EXTRA_GAME_TITLE, gameTitle.take(80))
                putExtra(NativeGbaActivity.EXTRA_GAME_IDENTITY, safeIdentity(gameIdentity))
                putExtra(NativeGbaActivity.EXTRA_SESSION_ID, sessionId)
            })
            true
        } catch (_: Throwable) {
            false
        }
    }

    fun consumeClosed(context: Context, sessionId: String): Boolean {
        if (sessionId.isBlank()) return false
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (prefs.getString(CLOSED_SESSION, "") != sessionId) return false
        prefs.edit().remove(CLOSED_SESSION).apply()
        return true
    }

    fun markClosed(context: Context, sessionId: String) {
        if (sessionId.isNotBlank()) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putString(CLOSED_SESSION, sessionId).apply()
        }
    }

    private fun safeIdentity(value: String): String {
        val safe = value.lowercase().replace(Regex("[^a-z0-9._-]"), "_").take(100)
        return safe.ifBlank { "gba-game" }
    }
}
