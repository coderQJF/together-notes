package uts.sdk.modules.togetherNativeGba

import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.Properties
import java.util.UUID

internal data class GbaSaveEntry(val slot: String, val title: String, val time: Long, val directory: File)

/** A slot points to one immutable generation: a failed overwrite never destroys its predecessor. */
internal class GbaSaveStore(private val root: File) {
    companion object {
        const val CORE_VERSION = "mgba-2026-10-09"
        const val MAX_STATE_BYTES = 16 * 1024 * 1024
        val SLOTS = listOf("quick", "auto") + (1..10).map { "slot-$it" }
    }

    @Synchronized fun list(): List<GbaSaveEntry> = SLOTS.mapNotNull { entry(it) }

    @Synchronized fun entry(slot: String): GbaSaveEntry? {
        require(slot in SLOTS)
        return try {
            val current = File(root, "$slot.current")
            val generation = (if (current.isFile) current else File(root, "$slot.previous")).readText().trim()
            require(Regex("[a-f0-9-]{36}").matches(generation))
            val directory = File(root, generation)
            val metadata = Properties().apply { File(directory, "info").inputStream().use { load(it) } }
            require(metadata.getProperty("slot") == slot)
            require(metadata.getProperty("core") == CORE_VERSION)
            GbaSaveEntry(slot, metadata.getProperty("title"), metadata.getProperty("time").toLong(), directory)
        } catch (_: Exception) { null }
    }

    @Synchronized fun write(slot: String, title: String, state: ByteArray, preview: ByteArray, time: Long = System.currentTimeMillis()) {
        require(slot in SLOTS && state.size in 1..MAX_STATE_BYTES)
        require(root.isDirectory || root.mkdirs())
        val previous = entry(slot)
        val generation = UUID.randomUUID().toString()
        val directory = File(root, generation).apply { check(mkdir()) }
        try {
            durableWrite(File(directory, "state"), state)
            durableWrite(File(directory, "preview.png"), preview)
            val metadata = Properties().apply {
                setProperty("slot", slot); setProperty("title", title.take(80))
                setProperty("time", time.toString()); setProperty("core", CORE_VERSION)
                setProperty("sha256", digest(state))
            }
            FileOutputStream(File(directory, "info")).use { metadata.store(it, null); it.fd.sync() }
            val pointer = File(root, "$slot.current.tmp")
            durableWrite(pointer, generation.toByteArray(Charsets.UTF_8))
            val current = File(root, "$slot.current")
            val backup = File(root, "$slot.previous")
            // A recovery pointer also works on filesystems that cannot rename over an existing file.
            if (current.exists()) {
                if (backup.exists()) check(backup.delete())
                check(current.renameTo(backup))
            }
            if (!pointer.renameTo(current)) {
                backup.renameTo(current)
                error("无法更新存档，请检查本机空间")
            }
            backup.delete()
            previous?.directory?.deleteRecursively()
        } catch (error: Exception) {
            directory.deleteRecursively()
            throw error
        }
    }

    @Synchronized fun read(slot: String): ByteArray {
        val entry = entry(slot) ?: error("这个存档不存在或版本不兼容")
        val file = File(entry.directory, "state")
        require(file.length() in 1..MAX_STATE_BYTES.toLong()) { "存档文件损坏" }
        val bytes = file.readBytes()
        val metadata = Properties().apply { File(entry.directory, "info").inputStream().use { load(it) } }
        require(digest(bytes) == metadata.getProperty("sha256")) { "存档校验失败" }
        return bytes
    }

    @Synchronized fun delete(slot: String) {
        val previous = entry(slot) ?: return
        val current = File(root, "$slot.current")
        val pointer = if (current.exists()) current else File(root, "$slot.previous")
        check(pointer.delete()) { "无法删除存档" }
        File(root, "$slot.previous").delete()
        previous.directory.deleteRecursively()
    }

    private fun durableWrite(file: File, bytes: ByteArray) {
        FileOutputStream(file).use { it.write(bytes); it.fd.sync() }
    }
    private fun digest(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes)
        .joinToString("") { "%02x".format(it.toInt() and 255) }
}
