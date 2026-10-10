package uts.sdk.modules.togetherNativeGba

import android.app.Activity
import android.content.pm.ActivityInfo
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Bundle
import android.os.Process
import android.view.KeyEvent
import android.view.MotionEvent
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
import java.nio.ByteOrder
import kotlin.math.abs
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
        session = NativeGbaSession(rom, saveFile, gameView) { message -> fail(message) }.also { it.start() }
    }

    override fun onPause() {
        session?.paused = true
        session?.requestSave()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        session?.paused = false
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
    fun retro_get_system_av_info(info: RetroSystemAvInfo)
    fun retro_get_memory_data(id: Int): Pointer?
    fun retro_get_memory_size(id: Int): NativeLong
}

internal class NativeGbaSession(
    private val romFile: File,
    private val saveFile: File,
    private val view: NativeGbaView,
    private val onFailure: (String) -> Unit,
) {
    @Volatile var paused = false
    @Volatile private var running = true
    @Volatile private var saveRequested = false
    private var thread: Thread? = null
    private var core: MgbaLibretro? = null
    private var audioTrack: AudioTrack? = null
    private var pixelFormat = PIXEL_FORMAT_RGB565
    private lateinit var romMemory: Memory
    private lateinit var systemDirectory: Memory

    private val environmentCallback = object : RetroEnvironmentCallback {
        override fun invoke(command: Int, data: Pointer?): Byte {
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
                ENV_GET_INPUT_BITMASKS -> 1
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
            if (data != null && count > 0) {
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
            val mask = view.inputMask
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

    fun close() {
        running = false
        thread?.interrupt()
        try { thread?.join(1200) } catch (_: InterruptedException) {}
        thread = null
    }

    private fun runLoop() {
        Process.setThreadPriority(Process.THREAD_PRIORITY_DISPLAY)
        try {
            val loadedCore = Native.load("mgba_libretro", MgbaLibretro::class.java)
            core = loadedCore
            systemDirectory = Memory((saveFile.parentFile.absolutePath.toByteArray(Charsets.UTF_8).size + 1).toLong()).apply {
                setString(0, saveFile.parentFile.absolutePath, "UTF-8")
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
            restoreSave(loadedCore)

            val av = RetroSystemAvInfo()
            loadedCore.retro_get_system_av_info(av)
            av.read()
            val sampleRate = av.timing.sampleRate.toInt().coerceIn(8000, 96000)
            val fps = av.timing.fps.coerceIn(30.0, 240.0)
            audioTrack = createAudioTrack(sampleRate).also { it.play() }
            view.markReady()

            val frameNanos = (1_000_000_000.0 / fps).toLong()
            var deadline = System.nanoTime()
            while (running) {
                if (paused) {
                    if (saveRequested) saveNow(loadedCore)
                    Thread.sleep(20)
                    deadline = System.nanoTime()
                    continue
                }
                loadedCore.retro_run()
                if (saveRequested) saveNow(loadedCore)
                deadline += frameNanos
                val wait = deadline - System.nanoTime()
                if (wait > 0) {
                    val millis = wait / 1_000_000
                    val nanos = (wait % 1_000_000).toInt()
                    Thread.sleep(millis, nanos)
                } else if (wait < -frameNanos * 4) {
                    deadline = System.nanoTime()
                }
            }
            saveNow(loadedCore)
        } catch (_: InterruptedException) {
            core?.let { saveNow(it) }
        } catch (error: Throwable) {
            onFailure(error.message?.takeIf { it.isNotBlank() } ?: "原生模拟器启动失败")
        } finally {
            try { audioTrack?.stop() } catch (_: Throwable) {}
            audioTrack?.release()
            audioTrack = null
            core?.let {
                try { it.retro_unload_game() } catch (_: Throwable) {}
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

internal class NativeGbaView(context: android.content.Context, private val gameTitle: String) : View(context) {
    @Volatile var inputMask = 0
        private set
    private val frameLock = Any()
    private val sourceRect = Rect()
    private val gameRect = RectF()
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textAlign = Paint.Align.CENTER
        typeface = android.graphics.Typeface.DEFAULT_BOLD
    }
    private var bitmap: Bitmap? = null
    private var ready = false
    private var dpadCenterX = 0f
    private var dpadCenterY = 0f
    private var dpadRadius = 0f
    private var buttonRadius = 0f
    private var aCenterX = 0f
    private var aCenterY = 0f
    private var bCenterX = 0f
    private var bCenterY = 0f
    private val selectRect = RectF()
    private val startRect = RectF()
    private val lRect = RectF()
    private val rRect = RectF()

    init {
        setBackgroundColor(Color.rgb(8, 8, 8))
        isFocusable = true
        isFocusableInTouchMode = true
    }

    fun markReady() {
        ready = true
        postInvalidateOnAnimation()
    }

    fun present(data: Pointer, width: Int, height: Int, pitch: Int, format: Int) {
        synchronized(frameLock) {
            if (format == 2) {
                val strideWidth = max(width, pitch / 2)
                val target = bitmap?.takeIf { it.width == strideWidth && it.height == height && it.config == Bitmap.Config.RGB_565 }
                    ?: Bitmap.createBitmap(strideWidth, height, Bitmap.Config.RGB_565).also { bitmap = it }
                val buffer = data.getByteBuffer(0, pitch.toLong() * height).order(ByteOrder.nativeOrder())
                buffer.position(0)
                target.copyPixelsFromBuffer(buffer)
                sourceRect.set(0, 0, width, height)
            } else {
                val strideWidth = max(width, pitch / 4)
                val pixels = IntArray(strideWidth * height)
                data.getByteBuffer(0, pitch.toLong() * height).order(ByteOrder.nativeOrder()).asIntBuffer().get(pixels)
                for (index in pixels.indices) pixels[index] = pixels[index] or -0x1000000
                val target = bitmap?.takeIf { it.width == strideWidth && it.height == height && it.config == Bitmap.Config.ARGB_8888 }
                    ?: Bitmap.createBitmap(strideWidth, height, Bitmap.Config.ARGB_8888).also { bitmap = it }
                target.setPixels(pixels, 0, strideWidth, 0, 0, strideWidth, height)
                sourceRect.set(0, 0, width, height)
            }
        }
        postInvalidateOnAnimation()
    }

    override fun onSizeChanged(width: Int, height: Int, oldWidth: Int, oldHeight: Int) {
        val shortSide = min(width, height).toFloat()
        dpadRadius = shortSide * 0.16f
        buttonRadius = shortSide * 0.07f
        dpadCenterX = shortSide * 0.23f
        dpadCenterY = height - shortSide * 0.25f
        aCenterX = width - shortSide * 0.17f
        aCenterY = height - shortSide * 0.31f
        bCenterX = width - shortSide * 0.31f
        bCenterY = height - shortSide * 0.20f
        val centerY = height - shortSide * 0.09f
        selectRect.set(width * 0.42f - shortSide * 0.07f, centerY - shortSide * 0.035f, width * 0.42f + shortSide * 0.07f, centerY + shortSide * 0.035f)
        startRect.set(width * 0.58f - shortSide * 0.07f, centerY - shortSide * 0.035f, width * 0.58f + shortSide * 0.07f, centerY + shortSide * 0.035f)
        lRect.set(shortSide * 0.08f, shortSide * 0.04f, shortSide * 0.32f, shortSide * 0.13f)
        rRect.set(width - shortSide * 0.32f, shortSide * 0.04f, width - shortSide * 0.08f, shortSide * 0.13f)
        val availableWidth = width - shortSide * 0.7f
        val availableHeight = height - shortSide * 0.12f
        val gameWidth = min(availableWidth, availableHeight * 1.5f)
        val gameHeight = gameWidth / 1.5f
        gameRect.set((width - gameWidth) / 2f, shortSide * 0.03f, (width + gameWidth) / 2f, shortSide * 0.03f + gameHeight)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        synchronized(frameLock) {
            bitmap?.let {
                paint.alpha = 255
                paint.isFilterBitmap = false
                canvas.drawBitmap(it, sourceRect, gameRect, paint)
            }
        }
        if (!ready) {
            textPaint.textSize = min(width, height) * 0.045f
            canvas.drawText("正在启动 $gameTitle", width / 2f, height / 2f, textPaint)
        }
        drawControls(canvas)
    }

    private fun drawControls(canvas: Canvas) {
        paint.color = Color.argb(72, 255, 255, 255)
        paint.style = Paint.Style.FILL
        val arm = dpadRadius * 0.42f
        canvas.drawRoundRect(dpadCenterX - arm, dpadCenterY - dpadRadius, dpadCenterX + arm, dpadCenterY + dpadRadius, arm * 0.35f, arm * 0.35f, paint)
        canvas.drawRoundRect(dpadCenterX - dpadRadius, dpadCenterY - arm, dpadCenterX + dpadRadius, dpadCenterY + arm, arm * 0.35f, arm * 0.35f, paint)
        paint.color = Color.argb(105, 247, 231, 173)
        canvas.drawCircle(aCenterX, aCenterY, buttonRadius, paint)
        canvas.drawCircle(bCenterX, bCenterY, buttonRadius, paint)
        canvas.drawRoundRect(selectRect, selectRect.height() / 2f, selectRect.height() / 2f, paint)
        canvas.drawRoundRect(startRect, startRect.height() / 2f, startRect.height() / 2f, paint)
        canvas.drawRoundRect(lRect, lRect.height() / 2f, lRect.height() / 2f, paint)
        canvas.drawRoundRect(rRect, rRect.height() / 2f, rRect.height() / 2f, paint)
        textPaint.textSize = buttonRadius * 0.75f
        canvas.drawText("A", aCenterX, aCenterY + textPaint.textSize * 0.34f, textPaint)
        canvas.drawText("B", bCenterX, bCenterY + textPaint.textSize * 0.34f, textPaint)
        textPaint.textSize = selectRect.height() * 0.42f
        canvas.drawText("SELECT", selectRect.centerX(), selectRect.centerY() + textPaint.textSize * 0.34f, textPaint)
        canvas.drawText("START", startRect.centerX(), startRect.centerY() + textPaint.textSize * 0.34f, textPaint)
        canvas.drawText("L", lRect.centerX(), lRect.centerY() + textPaint.textSize * 0.34f, textPaint)
        canvas.drawText("R", rRect.centerX(), rRect.centerY() + textPaint.textSize * 0.34f, textPaint)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        var mask = 0
        val releasedIndex = if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_POINTER_UP) event.actionIndex else -1
        for (index in 0 until event.pointerCount) {
            if (index == releasedIndex) continue
            mask = mask or controlsAt(event.getX(index), event.getY(index))
        }
        inputMask = mask
        return true
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        val button = keyMask(keyCode)
        if (button == 0) return super.onKeyDown(keyCode, event)
        inputMask = inputMask or button
        return true
    }

    override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
        val button = keyMask(keyCode)
        if (button == 0) return super.onKeyUp(keyCode, event)
        inputMask = inputMask and button.inv()
        return true
    }

    private fun controlsAt(x: Float, y: Float): Int {
        var mask = 0
        val dx = x - dpadCenterX
        val dy = y - dpadCenterY
        if (abs(dx) <= dpadRadius && abs(dy) <= dpadRadius) {
            if (dx < -dpadRadius * 0.2f) mask = mask or bit(BUTTON_LEFT)
            if (dx > dpadRadius * 0.2f) mask = mask or bit(BUTTON_RIGHT)
            if (dy < -dpadRadius * 0.2f) mask = mask or bit(BUTTON_UP)
            if (dy > dpadRadius * 0.2f) mask = mask or bit(BUTTON_DOWN)
        }
        if (distanceSquared(x, y, aCenterX, aCenterY) <= buttonRadius * buttonRadius * 1.5f) mask = mask or bit(BUTTON_A)
        if (distanceSquared(x, y, bCenterX, bCenterY) <= buttonRadius * buttonRadius * 1.5f) mask = mask or bit(BUTTON_B)
        if (selectRect.contains(x, y)) mask = mask or bit(BUTTON_SELECT)
        if (startRect.contains(x, y)) mask = mask or bit(BUTTON_START)
        if (lRect.contains(x, y)) mask = mask or bit(BUTTON_L)
        if (rRect.contains(x, y)) mask = mask or bit(BUTTON_R)
        return mask
    }

    private fun keyMask(keyCode: Int): Int = when (keyCode) {
        KeyEvent.KEYCODE_DPAD_UP -> bit(BUTTON_UP)
        KeyEvent.KEYCODE_DPAD_DOWN -> bit(BUTTON_DOWN)
        KeyEvent.KEYCODE_DPAD_LEFT -> bit(BUTTON_LEFT)
        KeyEvent.KEYCODE_DPAD_RIGHT -> bit(BUTTON_RIGHT)
        KeyEvent.KEYCODE_BUTTON_A -> bit(BUTTON_A)
        KeyEvent.KEYCODE_BUTTON_B -> bit(BUTTON_B)
        KeyEvent.KEYCODE_BUTTON_L1 -> bit(BUTTON_L)
        KeyEvent.KEYCODE_BUTTON_R1 -> bit(BUTTON_R)
        KeyEvent.KEYCODE_BUTTON_START -> bit(BUTTON_START)
        KeyEvent.KEYCODE_BUTTON_SELECT -> bit(BUTTON_SELECT)
        else -> 0
    }

    private fun bit(id: Int) = 1 shl id
    private fun distanceSquared(x: Float, y: Float, centerX: Float, centerY: Float): Float {
        val dx = x - centerX
        val dy = y - centerY
        return dx * dx + dy * dy
    }

    private companion object {
        const val BUTTON_B = 0
        const val BUTTON_SELECT = 2
        const val BUTTON_START = 3
        const val BUTTON_UP = 4
        const val BUTTON_DOWN = 5
        const val BUTTON_LEFT = 6
        const val BUTTON_RIGHT = 7
        const val BUTTON_A = 8
        const val BUTTON_L = 10
        const val BUTTON_R = 11
    }
}
