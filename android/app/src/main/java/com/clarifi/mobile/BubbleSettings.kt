package com.clarifi.mobile

import android.content.Context

object BubbleSettings {
    private const val PREFS = "clarifi_mobile"
    fun isEnabled(ctx: Context): Boolean = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("enabled", false)
    fun setEnabled(ctx: Context, yes: Boolean) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("enabled", yes).apply()
    fun opacity(ctx: Context): Float = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getFloat("opacity", .86f).coerceIn(.3f, 1f)
    fun setOpacity(ctx: Context, alpha: Float) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putFloat("opacity", alpha.coerceIn(.3f, 1f)).apply()
}