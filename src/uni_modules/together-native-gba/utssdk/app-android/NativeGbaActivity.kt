package uts.sdk.modules.togetherNativeGba

import android.app.Activity
import android.content.pm.ActivityInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Bundle
import android.os.Process
import android.view.View
import android.view.WindowManager
import android.widget.Toast
import com.sun.jna.Callback
import com.sun.jna.Library
import com.sun.jna.Memory
import com.sun.jna.Native
import com.sun.jna.NativeLong
import com.sun.jna.Pointer
import com.sun.jna.Structure
import java.io.File
import java.util.concurrent.ConcurrentLinkedQueue
import kotlin.math.max
import kotlin.math.min

internal class NativeGbaActivity : Activity() {
    companion object {
        const val EXTRA_ROM_PATH = "rom_path"
        const val EXTRA_GAME_TITLE = "game_title"
        const val EXTRA_GAME_IDENTITY = "game_identity"
        const val EXTRA_SESSION_ID = "session_id"
    }

    private lateinit var gameView: NativeGbaView
    private var session: NativeGbaSession? = null
    private var sessionId = ""
    private var controls: GbaPlayerMenu? = null
    private var backgrounded = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            )

        val romPath = intent.getStringExtra(EXTRA_ROM_PATH).orEmpty()
        val title = intent.getStringExtra(EXTRA_GAME_TITLE).orEmpty().ifBlank { "本机 GBA" }
        val identity = intent.getStringExtra(EXTRA_GAME_IDENTITY).orEmpty().ifBlank { "gba-game" }
        sessionId = intent.getStringExtra(EXTRA_SESSION_ID).orEmpty()
        gameView = NativeGbaView(this, title)
        setContentView(gameView)

        val rom = File(romPath)
        if (!rom.isFile || rom.length() <= 0L) {
            fail("本机游戏文件已不存在，请返回后重新下载")
            return
        }
        val saveDirectory = File(filesDir, "gba-saves").apply { mkdirs() }
        val saveFile = File(saveDirectory, "$identity.sav")
        val store = GbaSaveStore(File(saveDirectory, "$identity-states"))
        session = NativeGbaSession(rom, saveFile, gameView, store) { message -> fail(message) }.also {
            controls = GbaPlayerMenu(this, gameView, it, store)
            gameView.onMenu = { controls?.openMenu() }
            gameView.onSaves = { controls?.openSaves() }
            gameView.onSpeed = { speed -> it.speed = speed }
            it.start()
        }
    }

    override fun onPause() {
        backgrounded = true
        session?.paused = true
        gameView.releaseInputs()
        session?.requestSave()
        session?.autoSave()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        backgrounded = false
        session?.paused = controls?.isOpen == true
    }

    fun resumeGame() { gameView.releaseInputs(); session?.paused = backgrounded }

    @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
    override fun onBackPressed() {
        if (controls?.isOpen == true) controls?.dismiss() else controls?.openMenu()
    }

    override fun onDestroy() {
        session?.close()
        session = null
        NativeGbaLauncher.markClosed(this, sessionId)
        super.onDestroy()
    }

    private fun fail(message: String) {
        runOnUiThread {
            Toast.makeText(this, message, Toast.LENGTH_LONG).show()
            finish()
        }
    }
}

@Structure.FieldOrder("path", "data", "size", "meta")
internal class RetroGameInfo : Structure() {
    @JvmField var path: String? = null
    @JvmField var data: Pointer? = null
    @JvmField var size: NativeLong = NativeLong(0)
    @JvmField var meta: String? = null
}

@Structure.FieldOrder("baseWidth", "baseHeight", "maxWidth", "maxHeight", "aspectRatio")
internal class RetroGameGeometry : Structure() {
    @JvmField var baseWidth = 0
    @JvmField var baseHeight = 0
    @JvmField var maxWidth = 0
    @JvmField var maxHeight = 0
    @JvmField var aspectRatio = 0f
}

@Structure.FieldOrder("fps", "sampleRate")
internal class RetroSystemTiming : Structure() {
    @JvmField var fps = 59.7275
    @JvmField var sampleRate = 44100.0
}

@Structure.FieldOrder("geometry", "timing")
internal class RetroSystemAvInfo : Structure() {
    @JvmField var geometry = RetroGameGeometry()
    @JvmField var timing = RetroSystemTiming()
}

internal interface RetroEnvironmentCallback : Callback { fun invoke(command: Int, data: Pointer?): Byte }
internal interface RetroVideoCallback : Callback { fun invoke(data: Pointer?, width: Int, height: Int, pitch: NativeLong) }
internal interface RetroAudioSampleCallback : Callback { fun invoke(left: Short, right: Short) }
internal interface RetroAudioBatchCallback : Callback { fun invoke(data: Pointer?, frames: NativeLong): NativeLong }
internal interface RetroInputPollCallback : Callback { fun invoke() }
internal interface RetroInputStateCallback : Callback { fun invoke(port: Int, device: Int, index: Int, id: Int): Short }

internal interface MgbaLibretro : Library {
    fun retro_set_environment(callback: RetroEnvironmentCallback)
    fun retro_set_video_refresh(callback: RetroVideoCallback)
    fun retro_set_audio_sample(callback: RetroAudioSampleCallback)
    fun retro_set_audio_sample_batch(callback: RetroAudioBatchCallback)
    fun retro_set_input_poll(callback: RetroInputPollCallback)
    fun retro_set_input_state(callback: RetroInputStateCallback)
    fun retro_init()
    fun retro_deinit()
    fun retro_load_game(info: RetroGameInfo): Byte
    fun retro_unload_game()
    fun retro_run()
    fun retro_reset()
    fun retro_serialize_size(): NativeLong
    fun retro_serialize(data: Pointer, size: NativeLong): Byte
    fun retro_unserialize(data: Pointer, size: NativeLong): Byte
    fun retro_get_system_av_info(info: RetroSystemAvInfo)
    fun retro_get_memory_data(id: Int): Pointer?
    fun retro_get_memory_size(id: Int): NativeLong
}

internal class NativeGbaSession(
    private val romFile: File,
    private val saveFile: File,
    private val view: NativeGbaView,
    private val store: GbaSaveStore,
    private val onFailure: (String) -> Unit,
) {
    @Volatile var paused = false
    @Volatile private var running = true
    @Volatile private var saveRequested = false
    @Volatile var speed = 1
    @Volatile var sound = true
    @Volatile var ready = false
        private set
    private val commands = ConcurrentLinkedQueue<(MgbaLibretro) -> Unit>()
    private var frameIndex = 0L
    private var framesSinceAuto = 0L
    private var loaded = false
    private var thread: Thread? = null
    private var core: MgbaLibretro? = null
    private var audioTrack: AudioTrack? = null
    private var pixelFormat = PIXEL_FORMAT_RGB565
    private lateinit var romMemory: Memory
    private lateinit var systemDirectory: Memory

    private val environmentCallback = object : RetroEnvironmentCallback {
        override fun invoke(command: Int, data: Pointer?): Byte {
            if (command == (ENV_GET_INPUT_BITMASKS or 0x10000)) return 1
            if (data == null) return 0
            return when (command) {
                ENV_SET_PIXEL_FORMAT -> {
                    val requested = data.getInt(0)
                    if (requested == PIXEL_FORMAT_RGB565 || requested == PIXEL_FORMAT_XRGB8888) {
                        pixelFormat = requested
                        1
                    } else 0
                }
                ENV_GET_CAN_DUPE -> { data.setByte(0, 1); 1 }
                ENV_GET_SYSTEM_DIRECTORY, ENV_GET_SAVE_DIRECTORY -> {
                    data.setPointer(0, systemDirectory)
                    1
                }
                ENV_GET_INPUT_BITMASKS, (ENV_GET_INPUT_BITMASKS or 0x10000) -> 1
                (49 or 0x10000) -> { data.setByte(0, if (speed > 1) 1 else 0); 1 }
                ENV_GET_VARIABLE_UPDATE -> { data.setByte(0, 0); 1 }
                ENV_GET_VARIABLE -> {
                    data.setPointer(Native.POINTER_SIZE.toLong(), null)
                    1
                }
                ENV_SET_VARIABLES, ENV_SET_INPUT_DESCRIPTORS -> 1
                else -> 0
            }
        }
    }
    private val videoCallback = object : RetroVideoCallback {
        override fun invoke(data: Pointer?, width: Int, height: Int, pitch: NativeLong) {
            if (data != null && width > 0 && height > 0) {
                view.present(data, width, height, pitch.toLong().toInt(), pixelFormat)
            }
        }
    }
    private val audioSampleCallback = object : RetroAudioSampleCallback {
        override fun invoke(left: Short, right: Short) {}
    }
    private val audioBatchCallback = object : RetroAudioBatchCallback {
        override fun invoke(data: Pointer?, frames: NativeLong): NativeLong {
            val count = frames.toLong().coerceIn(0, 4096).toInt()
            if (data != null && count > 0 && sound && speed == 1 && !paused) {
                val samples = data.getShortArray(0, count * 2)
                audioTrack?.write(samples, 0, samples.size)
            }
            return NativeLong(count.toLong())
        }
    }
    private val inputPollCallback = object : RetroInputPollCallback { override fun invoke() {} }
    private val inputStateCallback = object : RetroInputStateCallback {
        override fun invoke(port: Int, device: Int, index: Int, id: Int): Short {
            if (port != 0 || device != RETRO_DEVICE_JOYPAD) return 0
            val mask = view.sampleInput(frameIndex)
            return if (id == RETRO_DEVICE_ID_JOYPAD_MASK) mask.toShort()
            else if (id in 0..15 && mask and (1 shl id) != 0) 1 else 0
        }
    }

    fun start() {
        thread = Thread({ runLoop() }, "together-native-gba").apply {
            priority = Thread.MAX_PRIORITY
            start()
        }
    }

    fun requestSave() { saveRequested = true }

    fun saveState(slot: String, title: String, complete: (String?) -> Unit) = enqueue(complete) { loadedCore ->
        val size = loadedCore.retro_serialize_size().toLong()
        check(size in 1..GbaSaveStore.MAX_STATE_BYTES.toLong()) { "当前模拟器无法生成存档" }
        Memory(size).use { memory ->
            check(loadedCore.retro_serialize(memory, NativeLong(size)).toInt() != 0) { "存档失败" }
            store.write(slot, title, memory.getByteArray(0, size.toInt()), view.previewPng())
        }
        saveNow(loadedCore)
    }

    fun loadState(slot: String, complete: (String?) -> Unit) = enqueue(complete) { loadedCore ->
        val bytes = store.read(slot)
        // Retain the running state so a rejected load cannot leave a half-restored game.
        val size = loadedCore.retro_serialize_size().toLong()
        check(size in 1..GbaSaveStore.MAX_STATE_BYTES.toLong())
        Memory(size).use { backup ->
            check(loadedCore.retro_serialize(backup, NativeLong(size)).toInt() != 0)
            Memory(bytes.size.toLong()).use { memory ->
                memory.write(0, bytes, 0, bytes.size)
                if (loadedCore.retro_unserialize(memory, NativeLong(bytes.size.toLong())).toInt() == 0) {
                    loadedCore.retro_unserialize(backup, NativeLong(size))
                    error("这个存档无法读取，当前游戏已保留")
                }
            }
        }
        view.releaseInputs()
        audioTrack?.pause(); audioTrack?.flush(); audioTrack?.play()
        saveNow(loadedCore)
    }

    fun reset(complete: (String?) -> Unit) = enqueue(complete) { loadedCore ->
        saveNow(loadedCore)
        loadedCore.retro_reset()
        view.releaseInputs()
    }

    fun autoSave() { if (ready) saveState("auto", "自动存档") {} }

    private fun enqueue(complete: (String?) -> Unit, operation: (MgbaLibretro) -> Unit) {
        if (!ready || !running) { view.post { complete("模拟器尚未就绪") }; return }
        commands.add { loadedCore ->
            val error = try { operation(loadedCore); null } catch (error: Exception) { error.message ?: "操作失败" }
            view.post { complete(error) }
        }
    }

    fun close() {
        autoSave()
        running = false
        // Let the worker finish queued saves before unloading the core.
        try { thread?.join(1200) } catch (_: InterruptedException) {}
        thread = null
    }

    private fun runLoop() {
        Process.setThreadPriority(Process.THREAD_PRIORITY_DISPLAY)
        try {
            val loadedCore = Native.load("mgba_libretro", MgbaLibretro::class.java)
            core = loadedCore
            val directoryPath = requireNotNull(saveFile.parentFile).absolutePath
            systemDirectory = Memory((directoryPath.toByteArray(Charsets.UTF_8).size + 1).toLong()).apply {
                setString(0, directoryPath, "UTF-8")
            }
            loadedCore.retro_set_environment(environmentCallback)
            loadedCore.retro_set_video_refresh(videoCallback)
            loadedCore.retro_set_audio_sample(audioSampleCallback)
            loadedCore.retro_set_audio_sample_batch(audioBatchCallback)
            loadedCore.retro_set_input_poll(inputPollCallback)
            loadedCore.retro_set_input_state(inputStateCallback)
            loadedCore.retro_init()

            val romBytes = romFile.readBytes()
            romMemory = Memory(romBytes.size.toLong()).apply { write(0, romBytes, 0, romBytes.size) }
            val game = RetroGameInfo().apply {
                path = romFile.absolutePath
                data = romMemory
                size = NativeLong(romBytes.size.toLong())
                write()
            }
            if (loadedCore.retro_load_game(game).toInt() == 0) throw IllegalStateException("无法载入这个 GBA 游戏")
            loaded = true
            restoreSave(loadedCore)

            val av = RetroSystemAvInfo()
            loadedCore.retro_get_system_av_info(av)
            av.read()
            val sampleRate = av.timing.sampleRate.toInt().coerceIn(8000, 96000)
            val fps = av.timing.fps.coerceIn(30.0, 240.0)
            audioTrack = createAudioTrack(sampleRate).also { it.play() }
            view.markReady()
            ready = true

            val frameNanos = (1_000_000_000.0 / fps).toLong()
            var deadline = System.nanoTime()
            while (running) {
                while (true) { val command = commands.poll() ?: break; command(loadedCore) }
                if (paused) {
                    if (saveRequested) saveNow(loadedCore)
                    Thread.sleep(20)
                    deadline = System.nanoTime()
                    continue
                }
                frameIndex++
                loadedCore.retro_run()
                framesSinceAuto++
                if (framesSinceAuto >= (fps * 60).toLong()) { autoSave(); framesSinceAuto = 0 }
                if (saveRequested) saveNow(loadedCore)
                deadline += frameNanos / speed.coerceIn(1, 4)
                val wait = deadline - System.nanoTime()
                if (wait > 0) {
                    val millis = wait / 1_000_000
                    val nanos = (wait % 1_000_000).toInt()
                    Thread.sleep(millis, nanos)
                } else if (wait < -frameNanos * 4) {
                    deadline = System.nanoTime()
                }
            }
            while (true) { val command = commands.poll() ?: break; command(loadedCore) }
            saveNow(loadedCore)
        } catch (_: InterruptedException) {
            core?.let { saveNow(it) }
        } catch (error: Throwable) {
            onFailure(error.message?.takeIf { it.isNotBlank() } ?: "原生模拟器启动失败")
        } finally {
            ready = false
            try { audioTrack?.stop() } catch (_: Throwable) {}
            audioTrack?.release()
            audioTrack = null
            core?.let {
                if (loaded) try { it.retro_unload_game() } catch (_: Throwable) {}
                try { it.retro_deinit() } catch (_: Throwable) {}
            }
            core = null
        }
    }

    private fun createAudioTrack(sampleRate: Int): AudioTrack {
        val minimum = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_STEREO, AudioFormat.ENCODING_PCM_16BIT)
        val bufferBytes = max(minimum, sampleRate / 5 * 4)
        @Suppress("DEPRECATION")
        return AudioTrack(
            AudioManager.STREAM_MUSIC,
            sampleRate,
            AudioFormat.CHANNEL_OUT_STEREO,
            AudioFormat.ENCODING_PCM_16BIT,
            bufferBytes,
            AudioTrack.MODE_STREAM,
        )
    }

    private fun restoreSave(loadedCore: MgbaLibretro) {
        if (!saveFile.isFile) return
        val pointer = loadedCore.retro_get_memory_data(RETRO_MEMORY_SAVE_RAM) ?: return
        val size = loadedCore.retro_get_memory_size(RETRO_MEMORY_SAVE_RAM).toLong().coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
        if (size <= 0) return
        val bytes = saveFile.readBytes()
        pointer.write(0, bytes, 0, min(bytes.size, size))
    }

    private fun saveNow(loadedCore: MgbaLibretro) {
        saveRequested = false
        try {
            val pointer = loadedCore.retro_get_memory_data(RETRO_MEMORY_SAVE_RAM) ?: return
            val size = loadedCore.retro_get_memory_size(RETRO_MEMORY_SAVE_RAM).toLong().coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
            if (size <= 0) return
            val temporary = File(saveFile.parentFile, "${saveFile.name}.tmp")
            temporary.writeBytes(pointer.getByteArray(0, size))
            if (!temporary.renameTo(saveFile)) {
                temporary.copyTo(saveFile, overwrite = true)
                temporary.delete()
            }
        } catch (_: Throwable) {}
    }

    private companion object {
        const val ENV_GET_CAN_DUPE = 3
        const val ENV_GET_SYSTEM_DIRECTORY = 9
        const val ENV_SET_PIXEL_FORMAT = 10
        const val ENV_GET_VARIABLE = 15
        const val ENV_SET_VARIABLES = 16
        const val ENV_GET_VARIABLE_UPDATE = 17
        const val ENV_SET_INPUT_DESCRIPTORS = 11
        const val ENV_GET_SAVE_DIRECTORY = 31
        const val ENV_GET_INPUT_BITMASKS = 51
        const val PIXEL_FORMAT_XRGB8888 = 1
        const val PIXEL_FORMAT_RGB565 = 2
        const val RETRO_DEVICE_JOYPAD = 1
        const val RETRO_DEVICE_ID_JOYPAD_MASK = 256
        const val RETRO_MEMORY_SAVE_RAM = 0
    }
}
