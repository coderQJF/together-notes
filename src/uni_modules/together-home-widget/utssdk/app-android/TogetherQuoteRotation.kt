package uts.sdk.modules.togetherHomeWidget

internal const val QUOTE_ROTATION_INTERVAL_MS = 30L * 60L * 1000L

/**
 * Maps each widget and half-hour time slot to one stable quote. The mapping is
 * deterministic so launcher redraws inside the same slot never make text jump.
 */
internal object TogetherQuoteRotation {
    fun slotAt(nowMillis: Long): Long = nowMillis / QUOTE_ROTATION_INTERVAL_MS

    fun indexAt(nowMillis: Long, appWidgetId: Int, quoteCount: Int): Int {
        if (quoteCount <= 0) return 0
        val mixedSlot = slotAt(nowMillis) + appWidgetId.toLong() * 37L
        return (mixedSlot % quoteCount.toLong()).toInt()
    }

    fun current(appWidgetId: Int, nowMillis: Long = System.currentTimeMillis()): TogetherWidgetQuote {
        return TogetherQuoteCatalog.quoteAt(indexAt(nowMillis, appWidgetId, TogetherQuoteCatalog.size))
    }
}
