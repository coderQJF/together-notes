package uts.sdk.modules.togetherNativeGba

import java.io.File
import java.nio.file.Files

fun main() {
    check(GbaInput.direction(0f, 0f) == 0)
    check(GbaInput.direction(0.1f, 0.1f) == 0)
    check(GbaInput.direction(1f, 0.2f) == GbaInput.RIGHT)
    check(GbaInput.direction(0.2f, -1f) == GbaInput.UP)
    check(GbaInput.direction(-0.8f, -0.8f) == GbaInput.LEFT or GbaInput.UP)
    check(GbaInput.direction(0.8f, 0.8f) == GbaInput.RIGHT or GbaInput.DOWN)
    for (frame in 0L..59L) {
        val expected = GbaInput.LEFT or if (frame % 6 < 3) GbaInput.A else 0
        check(GbaInput.sample(GbaInput.LEFT, 0, GbaInput.A, frame) == expected)
        check(GbaInput.sample(0, GbaInput.B, GbaInput.B, frame) == GbaInput.B)
    }
    check(GbaInput.sample(0, 0, 0, 3) == 0)
    val root = Files.createTempDirectory("gba-store-test-").toFile()
    try {
        val store = GbaSaveStore(root)
        val first = byteArrayOf(1, 2, 3)
        store.write("slot-1", "存档 1", first, byteArrayOf(5), 123)
        check(store.read("slot-1").contentEquals(first))
        check(store.entry("slot-1")!!.time == 123L)
        val second = byteArrayOf(4, 5, 6)
        store.write("slot-1", "存档 1", second, byteArrayOf(7), 456)
        check(store.read("slot-1").contentEquals(second))
        check(root.listFiles()!!.count { it.isDirectory } == 1)
        val blockedWrite = File(root, "slot-1.current.tmp").apply { check(mkdir()) }
        check(runCatching { store.write("slot-1", "io-failure", first, byteArrayOf()) }.isFailure)
        check(store.read("slot-1").contentEquals(second))
        check(blockedWrite.delete())
        check(runCatching { store.write("slot-1", "bad", byteArrayOf(), byteArrayOf()) }.isFailure)
        check(store.read("slot-1").contentEquals(second))
        check(runCatching { store.read("../state") }.isFailure)
        val state = File(store.entry("slot-1")!!.directory, "state")
        state.writeBytes(byteArrayOf(9))
        check(runCatching { store.read("slot-1") }.isFailure)
        store.write("slot-1", "repair", second, byteArrayOf())
        check(File(root, "slot-1.current").renameTo(File(root, "slot-1.previous")))
        check(store.read("slot-1").contentEquals(second))
        store.write("slot-1", "recover", first, byteArrayOf())
        check(store.read("slot-1").contentEquals(first))
        val other = GbaSaveStore(File(root, "other-game"))
        check(other.entry("slot-1") == null)
        for (slot in GbaSaveStore.SLOTS) store.write(slot, slot, first, byteArrayOf())
        check(store.list().size == 12)
        store.delete("slot-1")
        check(store.entry("slot-1") == null)
        check(store.read("quick").contentEquals(first))
        println("Native GBA input and save-store behavioral checks passed")
    } finally { root.deleteRecursively() }
}
