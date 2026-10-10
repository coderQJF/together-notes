package uts.sdk.modules.togetherNativeGba

import kotlin.math.abs

/** Frame-based repeat is sampled once per emulated frame, independent of callback count. */
internal object GbaInput {
    const val A = 1 shl 8
    const val B = 1
    const val UP = 1 shl 4
    const val DOWN = 1 shl 5
    const val LEFT = 1 shl 6
    const val RIGHT = 1 shl 7

    fun direction(dx: Float, dy: Float): Int {
        if (dx * dx + dy * dy < 0.18f * 0.18f) return 0
        var mask = 0
        if (abs(dx) >= abs(dy) * 0.45f) mask = mask or if (dx < 0) LEFT else RIGHT
        if (abs(dy) >= abs(dx) * 0.45f) mask = mask or if (dy < 0) UP else DOWN
        return mask
    }

    fun sample(touch: Int, hardware: Int, repeat: Int, frame: Long): Int =
        touch or hardware or if (frame % 6 < 3) repeat else 0
}
