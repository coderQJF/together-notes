package uts.sdk.modules.togetherNativeGba

import android.app.AlertDialog
import android.app.Dialog
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Owns every paused player surface; the emulator thread remains the only caller of the core. */
internal class GbaPlayerMenu(
    private val activity: NativeGbaActivity,
    private val view: NativeGbaView,
    private val session: NativeGbaSession,
    private val store: GbaSaveStore,
) {
    private var dialog: Dialog? = null
    private var body: LinearLayout? = null
    private var header: TextView? = null
    private var busy = false
    val isOpen get() = dialog != null
    private val brown = Color.rgb(73, 64, 50)
    private val butter = Color.rgb(247, 231, 173)
    private val canvas = Color.rgb(250, 248, 242)
    private fun dp(value: Int) = (value * activity.resources.displayMetrics.density).toInt()

    fun openMenu() {
        open("游戏已暂停")
        val target = body ?: return
        target.removeAllViews()
        addText(target, "快进键：正常 → 2 倍 → 4 倍；下排 A/B 为按住连发。快进时静音。", 14)
        row(target, listOf("快速存档" to { save("quick", "快速存档") },
            "快速读档" to { load("quick") }, "我的存档" to { openSaves() }))
        row(target, listOf((if (session.sound) "声音：开" else "声音：关") to {
            session.sound = !session.sound; openMenu()
        }, "重新开始" to {
            confirm("重新开始", "将回到游戏开头，游戏内存档会保留。") {
                submit { complete -> session.reset { error -> complete(error); if (error == null) dismiss() } }
            }
        }, "退出游戏" to {
            confirm("退出游戏", "保存当前画面为自动存档后退出？") {
                submit { complete -> session.saveState("auto", "自动存档") { error ->
                    complete(error)
                    if (error == null) { dismiss(); activity.finish() }
                } }
            }
        }))
    }

    fun openSaves() {
        open("我的存档")
        val target = body ?: return
        target.removeAllViews()
        addText(target, "本机保存 · 10 个手动槽 · 每分钟、切到后台及退出时自动存档", 13)
        val entries = store.list()
        val next = (1..10).map { "slot-$it" }.firstOrNull { slot -> entries.none { it.slot == slot } }
        val create = button(if (next == null) "手动存档已满（10/10）" else "新建存档（${entries.count { it.slot.startsWith("slot-") }}/10）") {
            if (next != null) save(next, "存档 ${next.substringAfter('-')}")
        }
        create.isEnabled = next != null
        target.addView(create, LinearLayout.LayoutParams(-1, dp(48)))
        for (slot in GbaSaveStore.SLOTS) {
            val entry = entries.firstOrNull { it.slot == slot }
            if (entry == null && slot.startsWith("slot-")) continue
            val title = entry?.title ?: if (slot == "quick") "快速存档" else "自动存档"
            val item = LinearLayout(activity).apply {
                orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(12), dp(8), dp(12), dp(8)); background = rounded(Color.WHITE)
            }
            val image = ImageView(activity).apply {
                scaleType = ImageView.ScaleType.FIT_CENTER
                contentDescription = "$title 游戏画面"
                setBackgroundColor(Color.rgb(32, 32, 32))
                entry?.let { setImageBitmap(BitmapFactory.decodeFile(File(it.directory, "preview.png").absolutePath)) }
            }
            item.addView(image, LinearLayout.LayoutParams(dp(96), dp(64)).apply { rightMargin = dp(12) })
            val copy = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
            addText(copy, title, 16)
            addText(copy, entry?.let { SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.CHINA).format(Date(it.time)) } ?: "尚未保存", 12)
            item.addView(copy, LinearLayout.LayoutParams(0, -2, 1f))
            if (entry != null) {
                item.addView(button("读档") { load(slot) }, LinearLayout.LayoutParams(dp(64), dp(48)))
                if (slot != "auto") item.addView(button("覆盖") { save(slot, title) }, LinearLayout.LayoutParams(dp(64), dp(48)))
                item.addView(button("删除") {
                    confirm("删除$title", "删除后无法恢复，是否继续？") {
                        if (!busy) {
                            try { store.delete(slot); openSaves() } catch (error: Exception) { toast(error.message ?: "删除失败") }
                        }
                    }
                }, LinearLayout.LayoutParams(dp(64), dp(48)))
            } else if (slot == "quick") item.addView(button("保存") { save(slot, title) }, LinearLayout.LayoutParams(dp(64), dp(48)))
            target.addView(item, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })
        }
    }

    private fun save(slot: String, title: String) {
        val operation = {
            submit { complete -> session.saveState(slot, title) { error ->
                complete(error)
                if (error == null) { toast("已保存$title"); if (isOpen) openSaves() }
            } }
        }
        if (store.entry(slot) != null) confirm("覆盖$title", "旧的即时存档会被当前画面替换。") { operation() }
        else operation()
    }

    private fun load(slot: String) {
        val entry = store.entry(slot) ?: run { toast("这个槽位尚无存档"); return }
        confirm("读取${entry.title}", "当前游戏将回到这个存档的画面，未存的操作将被替换。") {
            submit { complete -> session.loadState(slot) { error ->
                complete(error)
                if (error == null) { toast("已读取${entry.title}"); dismiss() }
            } }
        }
    }

    fun dismiss() { if (!busy) dialog?.dismiss() }

    private fun open(title: String) {
        if (busy) return
        session.paused = true; view.releaseInputs()
        if (dialog == null) {
            val root = LinearLayout(activity).apply {
                orientation = LinearLayout.VERTICAL; setPadding(dp(20), dp(12), dp(20), dp(12))
                setBackgroundColor(canvas)
            }
            val top = LinearLayout(activity).apply { gravity = Gravity.CENTER_VERTICAL }
            header = TextView(activity).apply { textSize = 20f; setTextColor(brown) }
            top.addView(header, LinearLayout.LayoutParams(0, dp(48), 1f))
            top.addView(button("返回游戏") { dismiss() }, LinearLayout.LayoutParams(dp(112), dp(48)))
            root.addView(top)
            body = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
            val scroll = ScrollView(activity).apply { addView(body) }
            root.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
            dialog = Dialog(activity).apply {
                setContentView(root); setCanceledOnTouchOutside(false)
                setOnCancelListener { if (busy) toast("正在处理存档") }
                setOnDismissListener {
                    dialog = null; body = null; header = null
                    activity.resumeGame()
                }
                show()
                window?.setLayout((activity.resources.displayMetrics.widthPixels * 0.94f).toInt(), (activity.resources.displayMetrics.heightPixels * 0.88f).toInt())
                window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }
        header?.text = title
    }

    private fun submit(operation: ((String?) -> Unit) -> Unit) {
        if (busy) return
        busy = true; dialog?.setCancelable(false); header?.text = "正在处理存档…"
        operation { error ->
            busy = false; dialog?.setCancelable(true)
            if (error != null) { toast(error); if (isOpen) openSaves() }
        }
    }

    private fun confirm(title: String, message: String, action: () -> Unit) {
        if (busy) return
        AlertDialog.Builder(activity).setTitle(title).setMessage(message)
            .setNegativeButton("取消", null).setPositiveButton("确定") { _, _ -> action() }.show()
    }

    private fun button(title: String, action: () -> Unit) = Button(activity).apply {
        text = title; textSize = 13f; isAllCaps = false; minHeight = dp(44); minimumWidth = dp(44)
        setTextColor(brown); background = rounded(butter); setPadding(dp(6), 0, dp(6), 0)
        setOnClickListener { if (!busy) action() }
    }
    private fun rounded(color: Int) = GradientDrawable().apply { setColor(color); cornerRadius = dp(18).toFloat() }
    private fun addText(parent: LinearLayout, value: String, size: Int) {
        parent.addView(TextView(activity).apply {
            text = value; textSize = size.toFloat(); setTextColor(brown); setPadding(0, dp(6), 0, dp(6))
        }, LinearLayout.LayoutParams(-1, -2))
    }
    private fun row(parent: LinearLayout, actions: List<Pair<String, () -> Unit>>) {
        val row = LinearLayout(activity)
        for ((title, action) in actions) row.addView(button(title, action), LinearLayout.LayoutParams(0, dp(60), 1f).apply { setMargins(dp(4), dp(8), dp(4), dp(8)) })
        parent.addView(row)
    }
    private fun toast(message: String) { Toast.makeText(activity, message, Toast.LENGTH_SHORT).show() }
}
