package uts.sdk.modules.togetherNativeGba

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import com.sun.jna.Pointer
import java.io.ByteArrayOutputStream
import java.nio.ByteOrder
import kotlin.math.max
import kotlin.math.min

internal class NativeGbaView(context: Context, private val gameTitle: String) : View(context) {
    var onMenu: () -> Unit = {}
    var onSaves: () -> Unit = {}
    var onSpeed: (Int) -> Unit = {}
    var speed = 1
        private set
    @Volatile private var touchMask = 0
    @Volatile private var hardwareMask = 0
    @Volatile private var repeatMask = 0
    private val frameLock = Any()
    private val source = Rect()
    private val screen = RectF()
    private var bitmap: Bitmap? = null
    @Volatile private var ready = false
    private var pixels = IntArray(0)
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE; textAlign = Paint.Align.CENTER
        typeface = android.graphics.Typeface.DEFAULT_BOLD
    }
    private val buttons = linkedMapOf<String, RectF>()
    private var dpad = RectF()
    private var actionPointer = -1
    private var actionName = ""
    private val dp get() = resources.displayMetrics.density

    init { setBackgroundColor(Color.BLACK); isFocusable = true; isFocusableInTouchMode = true }

    fun sampleInput(frame: Long) = GbaInput.sample(touchMask, hardwareMask, repeatMask, frame)
    fun releaseInputs() { touchMask = 0; hardwareMask = 0; repeatMask = 0; actionPointer = -1; postInvalidateOnAnimation() }
    fun markReady() { ready = true; postInvalidateOnAnimation() }

    fun previewPng(): ByteArray = synchronized(frameLock) {
        val frame = bitmap ?: error("游戏画面尚未就绪")
        val cropped = Bitmap.createBitmap(frame, 0, 0, source.width(), source.height())
        val output = ByteArrayOutputStream()
        try { check(cropped.compress(Bitmap.CompressFormat.PNG, 100, output)); output.toByteArray() }
        finally { if (cropped !== frame) cropped.recycle() }
    }

    fun present(data: Pointer, width: Int, height: Int, pitch: Int, format: Int) {
        synchronized(frameLock) {
            val stride = pitch / if (format == 2) 2 else 4
            val config = if (format == 2) Bitmap.Config.RGB_565 else Bitmap.Config.ARGB_8888
            val target = bitmap?.takeIf { it.width == stride && it.height == height && it.config == config }
                ?: Bitmap.createBitmap(stride, height, config).also { bitmap?.recycle(); bitmap = it }
            val buffer = data.getByteBuffer(0, pitch.toLong() * height).order(ByteOrder.nativeOrder())
            if (format == 2) target.copyPixelsFromBuffer(buffer) else {
                if (pixels.size != stride * height) pixels = IntArray(stride * height)
                buffer.asIntBuffer().get(pixels)
                for (i in pixels.indices) pixels[i] = pixels[i] or -0x1000000
                target.setPixels(pixels, 0, stride, 0, 0, stride, height)
            }
            source.set(0, 0, width, height)
        }
        postInvalidateOnAnimation()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        val height = h.toFloat()
        val edge = max(12 * dp, height * 0.04f)
        val radius = max(24 * dp, height * 0.083f)
        val sideWidth = max(height * 0.48f, radius * 4.6f)
        val centerLeft = edge + sideWidth
        val centerRight = w - edge - sideWidth
        val available = max(1f, centerRight - centerLeft)
        val imageWidth = min(available, height * 0.66f * 1.5f)
        val screenTop = max(46 * dp, height * 0.12f)
        screen.set((w - imageWidth) / 2, screenTop, (w + imageWidth) / 2, screenTop + imageWidth / 1.5f)
        val dr = max(66 * dp, height * 0.205f)
        val cx = edge + sideWidth / 2
        val cy = height * 0.69f
        dpad.set(cx - dr, cy - dr, cx + dr, cy + dr)
        buttons.clear()
        fun rectangle(name: String, x: Float, y: Float, width: Float, height: Float) {
            buttons[name] = RectF(x - width / 2, y - height / 2, x + width / 2, y + height / 2)
        }
        rectangle("L", cx, height * 0.15f, dr * 1.7f, max(44 * dp, height * 0.10f))
        rectangle("R", w - cx, height * 0.15f, dr * 1.7f, max(44 * dp, height * 0.10f))
        val rx = w - edge - sideWidth / 2
        for ((name, x, y) in listOf(Triple("B", rx - radius * 1.15f, height * 0.61f),
            Triple("A", rx + radius * 1.15f, height * 0.61f),
            Triple("B连发", rx - radius * 1.15f, height * 0.84f),
            Triple("A连发", rx + radius * 1.15f, height * 0.84f))) {
            rectangle(name, x, y, radius * 2, radius * 2)
        }
        val centerWidth = min(available / 3 - 8 * dp, 100 * dp)
        val centerY = height * 0.86f
        rectangle("选择", w / 2f - centerWidth - 8 * dp, centerY, centerWidth, 44 * dp)
        rectangle("开始", w / 2f, centerY, centerWidth, 44 * dp)
        rectangle("快进", w / 2f + centerWidth + 8 * dp, centerY, centerWidth, 44 * dp)
        val toolbarY = max(22 * dp, height * 0.06f)
        rectangle("存档", w / 2f + 58 * dp, toolbarY, 92 * dp, 44 * dp)
        rectangle("菜单", w / 2f - 58 * dp, toolbarY, 92 * dp, 44 * dp)
    }

    override fun onDraw(canvas: Canvas) {
        synchronized(frameLock) {
            paint.alpha = 255; paint.isFilterBitmap = false
            bitmap?.let { canvas.drawBitmap(it, source, screen, paint) }
        }
        if (!ready) label(canvas, "正在启动 $gameTitle", width / 2f, height / 2f, 16 * dp)
        drawDpad(canvas)
        for ((name, rect) in buttons) {
            val circular = name in listOf("A", "B", "A连发", "B连发")
            val mask = maskFor(name)
            val pressed = mask != 0 && (if (name.endsWith("连发")) repeatMask else touchMask or hardwareMask) and mask != 0
            paint.color = if (pressed) Color.rgb(247, 231, 173) else when (name) {
                "A" -> Color.rgb(153, 125, 49)
                "B" -> Color.rgb(142, 66, 59)
                "A连发" -> Color.rgb(61, 104, 71)
                "B连发" -> Color.rgb(59, 85, 133)
                else -> Color.rgb(49, 47, 43)
            }
            paint.style = Paint.Style.FILL
            if (circular) canvas.drawOval(rect, paint) else canvas.drawRoundRect(rect, 18 * dp, 18 * dp, paint)
            paint.color = Color.argb(140, 210, 200, 180); paint.style = Paint.Style.STROKE; paint.strokeWidth = 1.5f * dp
            if (circular) canvas.drawOval(rect, paint) else canvas.drawRoundRect(rect, 18 * dp, 18 * dp, paint)
            paint.style = Paint.Style.FILL
            val title = if (name == "快进" && speed > 1) "${speed}×" else name
            text.color = if (pressed) Color.rgb(73, 64, 50) else Color.rgb(247, 231, 173)
            label(canvas, title, rect.centerX(), rect.centerY(), if (name == "A" || name == "B") 24 * dp else 13 * dp)
        }
    }

    private fun drawDpad(canvas: Canvas) {
        val cx = dpad.centerX(); val cy = dpad.centerY(); val radius = dpad.width() / 2
        paint.style = Paint.Style.FILL; paint.color = Color.rgb(36, 35, 32)
        canvas.drawOval(dpad, paint)
        paint.style = Paint.Style.STROKE; paint.strokeWidth = 2 * dp; paint.color = Color.rgb(92, 88, 78)
        canvas.drawOval(dpad, paint); paint.style = Paint.Style.FILL
        val arm = radius * 0.35f
        paint.color = Color.rgb(62, 59, 52)
        canvas.drawRoundRect(cx - arm, cy - radius * 0.88f, cx + arm, cy + radius * 0.88f, 12 * dp, 12 * dp, paint)
        canvas.drawRoundRect(cx - radius * 0.88f, cy - arm, cx + radius * 0.88f, cy + arm, 12 * dp, 12 * dp, paint)
        val mask = touchMask or hardwareMask
        for ((bit, angle) in listOf(GbaInput.UP to 0f, GbaInput.RIGHT to 90f, GbaInput.DOWN to 180f, GbaInput.LEFT to 270f)) {
            canvas.save(); canvas.rotate(angle, cx, cy)
            paint.color = if (mask and bit != 0) Color.rgb(247, 231, 173) else Color.rgb(161, 153, 134)
            val path = Path().apply {
                moveTo(cx, cy - radius * 0.72f); lineTo(cx - arm * 0.48f, cy - radius * 0.45f)
                lineTo(cx + arm * 0.48f, cy - radius * 0.45f); close()
            }
            canvas.drawPath(path, paint); canvas.restore()
        }
    }

    private fun label(canvas: Canvas, value: String, x: Float, y: Float, size: Float) {
        text.textSize = size
        canvas.drawText(value, x, y - (text.ascent() + text.descent()) / 2, text)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (event.actionMasked == MotionEvent.ACTION_CANCEL) { releaseInputs(); return true }
        val index = event.actionIndex
        if (event.actionMasked == MotionEvent.ACTION_DOWN || event.actionMasked == MotionEvent.ACTION_POINTER_DOWN) {
            val hit = buttons.entries.firstOrNull { it.value.contains(event.getX(index), event.getY(index)) }?.key.orEmpty()
            if (hit in listOf("菜单", "存档", "快进") && actionPointer == -1) {
                actionPointer = event.getPointerId(index); actionName = hit
            }
        }
        if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_POINTER_UP) {
            if (event.getPointerId(index) == actionPointer) {
                val action = actionName
                val hit = buttons[action]?.contains(event.getX(index), event.getY(index)) == true
                actionPointer = -1
                if (hit) {
                    performClick()
                    when (action) {
                        "菜单" -> { releaseInputs(); onMenu() }
                        "存档" -> { releaseInputs(); onSaves() }
                        "快进" -> { speed = when (speed) { 1 -> 2; 2 -> 4; else -> 1 }; onSpeed(speed) }
                    }
                }
            }
        }
        var touch = 0; var repeat = 0
        val released = if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_POINTER_UP) index else -1
        for (i in 0 until event.pointerCount) {
            if (i == released || event.getPointerId(i) == actionPointer) continue
            val x = event.getX(i); val y = event.getY(i)
            if (dpad.contains(x, y)) touch = touch or GbaInput.direction((x - dpad.centerX()) / (dpad.width() / 2), (y - dpad.centerY()) / (dpad.height() / 2))
            else for ((name, rect) in buttons) if (rect.contains(x, y)) {
                if (name.endsWith("连发")) repeat = repeat or maskFor(name) else touch = touch or maskFor(name)
            }
        }
        touchMask = touch; repeatMask = repeat; invalidate()
        return true
    }

    override fun performClick(): Boolean { super.performClick(); return true }
    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        val mask = keyMask(keyCode)
        if (mask == 0) return super.onKeyDown(keyCode, event)
        hardwareMask = hardwareMask or mask; invalidate(); return true
    }
    override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
        val mask = keyMask(keyCode)
        if (mask == 0) return super.onKeyUp(keyCode, event)
        hardwareMask = hardwareMask and mask.inv(); invalidate(); return true
    }
    private fun maskFor(name: String): Int = when (name) {
        "A", "A连发" -> GbaInput.A; "B", "B连发" -> GbaInput.B
        "选择" -> 1 shl 2; "开始" -> 1 shl 3; "L" -> 1 shl 10; "R" -> 1 shl 11; else -> 0
    }
    private fun keyMask(code: Int): Int = when (code) {
        KeyEvent.KEYCODE_DPAD_UP -> GbaInput.UP; KeyEvent.KEYCODE_DPAD_DOWN -> GbaInput.DOWN
        KeyEvent.KEYCODE_DPAD_LEFT -> GbaInput.LEFT; KeyEvent.KEYCODE_DPAD_RIGHT -> GbaInput.RIGHT
        KeyEvent.KEYCODE_BUTTON_A -> GbaInput.A; KeyEvent.KEYCODE_BUTTON_B -> GbaInput.B
        KeyEvent.KEYCODE_BUTTON_L1 -> 1 shl 10; KeyEvent.KEYCODE_BUTTON_R1 -> 1 shl 11
        KeyEvent.KEYCODE_BUTTON_START -> 1 shl 3; KeyEvent.KEYCODE_BUTTON_SELECT -> 1 shl 2; else -> 0
    }
}
