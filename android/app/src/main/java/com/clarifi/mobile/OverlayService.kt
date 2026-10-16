package com.clarifi.mobile

import android.animation.ObjectAnimator
import android.animation.PropertyValuesHolder
import android.animation.ValueAnimator
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import kotlin.math.abs

/** Explicit opt-in overlay; it never reads the screen or taps inside another app. */
class OverlayService : Service() {
    companion object {
        const val START = "clarifi.action.OVERLAY_START"
        const val STOP = "clarifi.action.OVERLAY_STOP"
        const val REFRESH = "clarifi.action.OVERLAY_REFRESH"
        const val HIDE = "clarifi.action.OVERLAY_HIDE"
        const val SHOW = "clarifi.action.OVERLAY_SHOW"
        const val RESULT = "clarifi.action.OVERLAY_RESULT"
    }

    private lateinit var wm: WindowManager
    private var bubble: FrameLayout? = null
    private var panel: View? = null
    private var pulse: ObjectAnimator? = null
    private var params: WindowManager.LayoutParams? = null

    override fun onBind(intent: Intent?): IBinder? = null
    override fun onCreate() {
        super.onCreate()
        wm = getSystemService(WINDOW_SERVICE) as WindowManager
        val notification = NotificationSupport.make(this, "ClariFi bubble is active", "Tap the bubble to request a screen check")
        if (Build.VERSION.SDK_INT >= 34) startForeground(102, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(102, notification)
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            STOP -> { BubbleSettings.setEnabled(this, false); stopSelf(); return START_NOT_STICKY }
            HIDE -> hideBubble()
            SHOW -> showBubble()
            RESULT -> { showBubble(); showResultPanel() }
            REFRESH -> bubble?.alpha = BubbleSettings.opacity(this)
            else -> if (BubbleSettings.isEnabled(this) && Settings.canDrawOverlays(this)) showBubble() else stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun showBubble() {
        if (!Settings.canDrawOverlays(this)) return
        if (bubble != null) { bubble!!.visibility = View.VISIBLE; return }
        val size = dp(64)
        val view = FrameLayout(this).apply {
            background = gradient(Color.rgb(31, 22, 63), Color.rgb(63, 38, 116), 32f, Color.rgb(169, 135, 255))
            elevation = dp(14).toFloat()
            alpha = BubbleSettings.opacity(this@OverlayService)
            contentDescription = "ClariFi tap to analyze the screen"
        }
        val mascot = try { assets.open("clarifi-mascot.png").use { BitmapFactory.decodeStream(it) } } catch (_: Exception) { null }
        if (mascot != null) {
            val img = ImageView(this).apply { setImageBitmap(mascot); scaleType = ImageView.ScaleType.FIT_CENTER }
            view.addView(img, FrameLayout.LayoutParams(dp(55), dp(55), Gravity.CENTER))
        } else {
            view.addView(label("◎", 38f, Color.rgb(234, 214, 255), true),
                FrameLayout.LayoutParams(-2, -2, Gravity.CENTER))
        }
        val p = WindowManager.LayoutParams(size, size, WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            android.graphics.PixelFormat.TRANSLUCENT)
        p.gravity = Gravity.TOP or Gravity.START
        p.x = resources.displayMetrics.widthPixels - size - dp(12)
        p.y = resources.displayMetrics.heightPixels / 3
        params = p
        var downX = 0f; var downY = 0f; var originalX = 0; var originalY = 0
        var dragged = false
        view.setOnTouchListener { _, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downX = e.rawX; downY = e.rawY
                    originalX = p.x; originalY = p.y; dragged = false; true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - downX; val dy = e.rawY - downY
                    if (abs(dx) > dp(7) || abs(dy) > dp(7)) dragged = true
                    if (dragged) {
                        p.x = (originalX + dx.toInt()).coerceIn(0, resources.displayMetrics.widthPixels - size)
                        p.y = (originalY + dy.toInt()).coerceIn(0, resources.displayMetrics.heightPixels - size)
                        wm.updateViewLayout(view, p)
                    }
                    true
                }
                MotionEvent.ACTION_UP -> { if (!dragged) requestCapture(); true }
                else -> true
            }
        }
        wm.addView(view, p)
        bubble = view
        pulse = ObjectAnimator.ofPropertyValuesHolder(
            view,
            PropertyValuesHolder.ofFloat("scaleX", .96f, 1.04f),
            PropertyValuesHolder.ofFloat("scaleY", .96f, 1.04f)
        ).apply {
            duration = 1800
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
            interpolator = AccelerateDecelerateInterpolator()
            start()
        }
    }
    private fun hideBubble() { bubble?.visibility = View.INVISIBLE; dismissPanel() }
    private fun requestCapture() {
        dismissPanel()
        startActivity(Intent(this, CaptureActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    private fun showResultPanel() {
        dismissPanel()
        if (!Settings.canDrawOverlays(this)) return
        val result = AnalysisSession.latest ?: return
        val outer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = gradient(Color.rgb(28, 22, 49), Color.rgb(14, 13, 28), 25f, Color.rgb(117, 86, 175))
            elevation = dp(18).toFloat()
            setPadding(dp(20), dp(18), dp(20), dp(18))
        }
        outer.addView(label("✦  C L A R I F I  /  E V I D E N C E", 11f, Color.rgb(194, 172, 255), true))
        outer.addView(space(10))
        outer.addView(label(result.rung.label, 25f,
            if (result.rung == EvidenceEngine.Rung.NONE) Color.WHITE else Color.rgb(194, 172, 255), true))
        outer.addView(space(4))
        outer.addView(label(result.origin, 11f, Color.rgb(168, 158, 194), false))
        outer.addView(space(13))
        if (result.evidence.isEmpty()) {
            outer.addView(label("No explicit AI-text indicators found. This does not prove the media is human-made.",
                13f, Color.WHITE, false))
        } else result.evidence.take(5).forEach { ev ->
            outer.addView(label("•  ${ev.description}", 13f, Color.WHITE, false))
            outer.addView(space(9))
        }
        outer.addView(space(10))
        outer.addView(label("On-device text signals only. Platform labels on a screenshot are unverified.",
            11f, Color.rgb(169, 156, 193), false))
        outer.addView(space(14))
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.END }
        row.addView(action("Close") { dismissPanel() })
        row.addView(space(12))
        row.addView(action("Open ClariFi") {
            startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP))
            dismissPanel()
        })
        outer.addView(row)
        val scroll = ScrollView(this).apply { isFillViewport = false; addView(outer) }
        val p = WindowManager.LayoutParams(resources.displayMetrics.widthPixels - dp(32),
            WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            android.graphics.PixelFormat.TRANSLUCENT)
        p.gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
        p.y = dp(85)
        try { wm.addView(scroll, p); panel = scroll } catch (_: Exception) { panel = null }
    }
    private fun dismissPanel() { panel?.let { try { wm.removeView(it) } catch (_: Exception) {} }; panel = null }
    private fun label(text: String, size: Float, color: Int, bold: Boolean) = TextView(this).apply {
        this.text = text
        setTextSize(size)
        setTextColor(color)
        if (bold) setTypeface(typeface, Typeface.BOLD)
        includeFontPadding = true
    }
    private fun action(title: String, listener: () -> Unit) = label(title, 13f, Color.rgb(199, 180, 255), true).apply {
        setPadding(dp(9), dp(9), dp(9), dp(9))
        setOnClickListener { listener() }
    }
    private fun space(size: Int) = View(this).apply { layoutParams = LinearLayout.LayoutParams(dp(size), dp(size)) }
    private fun gradient(start: Int, end: Int, radius: Float, stroke: Int) = GradientDrawable(
        GradientDrawable.Orientation.TL_BR, intArrayOf(start, end)).apply {
        cornerRadius = dp(radius.toInt()).toFloat()
        setStroke(dp(1), stroke)
    }
    private fun dp(value: Int): Int = (value * resources.displayMetrics.density + .5f).toInt()
    override fun onDestroy() {
        pulse?.cancel()
        dismissPanel()
        bubble?.let { try { wm.removeView(it) } catch (_: Exception) {} }
        bubble = null
        super.onDestroy()
    }
}