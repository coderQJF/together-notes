package uts.sdk.modules.togetherHomeWidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import io.dcloud.uni_modules.together_home_widget.R

internal object TogetherQuoteWidgetRenderer {
    const val ACTION_REFRESH = "uts.sdk.modules.togetherHomeWidget.action.REFRESH_QUOTE"

    fun update(context: Context, manager: AppWidgetManager, appWidgetId: Int) {
        val quote = TogetherQuoteRotation.current(appWidgetId)
        val views = RemoteViews(context.packageName, R.layout.together_quote_widget).apply {
            setTextViewText(R.id.together_quote_body, "“${quote.text}”")
            setTextViewText(R.id.together_quote_author, "— ${quote.author}")
            val minHeight = manager.getAppWidgetOptions(appWidgetId)
                .getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110)
            setInt(R.id.together_quote_body, "setMaxLines", when {
                minHeight < 100 -> 2
                minHeight < 145 -> 4
                else -> 7
            })
            setViewVisibility(R.id.together_quote_configure, View.VISIBLE)
            setOnClickPendingIntent(android.R.id.background, refreshPendingIntent(context, appWidgetId))
            setOnClickPendingIntent(R.id.together_quote_configure, configurePendingIntent(context, appWidgetId))
            setContentDescription(android.R.id.background, "句读：${quote.text}，${quote.author}")
        }
        manager.updateAppWidget(appWidgetId, views)
    }

    fun handleRefresh(context: Context, intent: Intent): Boolean {
        if (intent.action != ACTION_REFRESH) return false
        val appWidgetId = intent.getIntExtra(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID,
        )
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return true
        if (TogetherHomeWidgetStore.isQuoteSelected(context, appWidgetId)) {
            update(context, AppWidgetManager.getInstance(context), appWidgetId)
        }
        return true
    }

    private fun refreshPendingIntent(context: Context, appWidgetId: Int): PendingIntent {
        val intent = Intent(context, TogetherNoteWidgetProvider::class.java).apply {
            action = ACTION_REFRESH
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
            data = Uri.parse("together-notes://widget/quote/refresh/$appWidgetId")
        }
        return PendingIntent.getBroadcast(
            context,
            appWidgetId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun configurePendingIntent(context: Context, appWidgetId: Int): PendingIntent {
        val intent = Intent(context, TogetherNoteWidgetConfigureActivity::class.java).apply {
            action = AppWidgetManager.ACTION_APPWIDGET_CONFIGURE
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
            data = Uri.parse("together-notes://widget/configure/$appWidgetId")
        }
        return PendingIntent.getActivity(
            context,
            appWidgetId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}
