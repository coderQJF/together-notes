package uts.sdk.modules.togetherNativeGba

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import java.io.File

/** Standalone QA launcher; never included in the release plugin or application. */
class GbaQaActivity : Activity() {
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        val rom = File(filesDir, "qa.gba")
        assets.open("qa.gba").use { input -> rom.outputStream().use { input.copyTo(it) } }
        startActivity(Intent(this, NativeGbaActivity::class.java).apply {
            putExtra(NativeGbaActivity.EXTRA_ROM_PATH, rom.absolutePath)
            putExtra(NativeGbaActivity.EXTRA_GAME_TITLE, "原生操作验证")
            putExtra(NativeGbaActivity.EXTRA_GAME_IDENTITY, "qa-homebrew")
            putExtra(NativeGbaActivity.EXTRA_SESSION_ID, "qa-session")
        })
        finish()
    }
}
