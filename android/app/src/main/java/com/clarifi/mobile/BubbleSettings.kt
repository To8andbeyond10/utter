package com.clarifi.mobile

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.util.Locale
import kotlin.math.roundToInt

object BubbleSettings {
    private const val PREFS = "clarifi_mobile"
    const val MIN_LEVEL = 1
    const val MAX_LEVEL = 10
    private const val DEFAULT_LEVEL = 9

    fun isEnabled(ctx: Context): Boolean = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("enabled", false)
    fun setEnabled(ctx: Context, yes: Boolean) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("enabled", yes).apply()

    /** Visibility step 1..10 (10% .. 100%); each step has its own pre-faded transparent mascot PNG. */
    fun visibility(ctx: Context): Int {
        val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (prefs.contains("visibility")) return prefs.getInt("visibility", DEFAULT_LEVEL).coerceIn(MIN_LEVEL, MAX_LEVEL)
        // Milestone 1 stored a 0.3..1 alpha float; carry it over to the nearest step.
        if (prefs.contains("opacity")) return (prefs.getFloat("opacity", .9f) * 10).roundToInt().coerceIn(MIN_LEVEL, MAX_LEVEL)
        return DEFAULT_LEVEL
    }
    fun setVisibility(ctx: Context, level: Int) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        .putInt("visibility", level.coerceIn(MIN_LEVEL, MAX_LEVEL)).remove("opacity").apply()

    /** Asset path (served from repo brand/) of the mascot for a visibility step. */
    fun mascotAsset(level: Int): String {
        val l = level.coerceIn(MIN_LEVEL, MAX_LEVEL)
        return String.format(Locale.US, "mascot-opacity/mascot-%02d-%dpct.png", l, l * 10)
    }
    fun loadMascot(ctx: Context, level: Int = MAX_LEVEL): Bitmap? =
        try { ctx.assets.open(mascotAsset(level)).use { BitmapFactory.decodeStream(it) } } catch (_: Exception) { null }
}
