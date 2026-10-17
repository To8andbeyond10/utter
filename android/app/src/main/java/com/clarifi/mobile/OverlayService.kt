package com.clarifi.mobile

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.util.DisplayMetrics
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.View
import android.view.WindowInsets
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.roundToInt

/** Explicit opt-in overlay; it never reads the screen or taps inside another app. */
class OverlayService : Service() {
    companion object {
        const val START = "clarifi.action.OVERLAY_START"
        const val STOP = "clarifi.action.OVERLAY_STOP"
        const val REFRESH = "clarifi.action.OVERLAY_REFRESH"
        const val HIDE = "clarifi.action.OVERLAY_HIDE"
        const val SHOW = "clarifi.action.OVERLAY_SHOW"
        const val RESULT = "clarifi.action.OVERLAY_RESULT"

        private val Lavender = Color.rgb(194, 172, 255)
        private val Muted = Color.rgb(169, 156, 193)
        private val Gold = Color.rgb(255, 214, 140)
        private val Coral = Color.rgb(255, 176, 176)
    }

    /** Screen size plus the system-bar/cutout insets the bubble should stay clear of. */
    private data class Screen(val width: Int, val height: Int, val insets: Rect)

    private lateinit var wm: WindowManager
    private var bubble: FrameLayout? = null
    private var bubbleImage: ImageView? = null
    private var params: WindowManager.LayoutParams? = null
    private var dismissZone: FrameLayout? = null
    private var dismissCircle: TextView? = null
    private var panel: View? = null
    private var snap: ValueAnimator? = null

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
            REFRESH -> bubbleImage?.let { applyMascot(it) }
            else -> if (BubbleSettings.isEnabled(this) && Settings.canDrawOverlays(this)) showBubble() else stopSelf()
        }
        return START_NOT_STICKY
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        // Rotation or a fold changes the screen; re-dock from the saved edge and height.
        dismissPanel()
        val view = bubble ?: return
        val p = params ?: return
        snap?.cancel()
        placeAtDock(p)
        safeUpdate(view, p)
        rebuildDismissZone()
    }

    // ---- Bubble ----------------------------------------------------------------------------

    private fun bubbleSize() = dp(60)

    private fun showBubble() {
        if (!Settings.canDrawOverlays(this)) return
        bubble?.let { if (it.visibility != View.VISIBLE) { it.visibility = View.VISIBLE; popIn(it) }; return }
        val size = bubbleSize()
        // Added first so it sits *under* the bubble; hidden (GONE) whenever no drag is happening.
        rebuildDismissZone()
        // The transparent circular mascot is the whole button: no backing shape, no view alpha.
        // Fading comes only from the pre-faded PNG, so the touch target stays the same at every step.
        val view = FrameLayout(this).apply {
            contentDescription = "ClariFi. Double-tap to check the text on your screen."
            isClickable = true
            setOnClickListener {
                it.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
                requestCapture()
            }
        }
        val img = ImageView(this).apply { scaleType = ImageView.ScaleType.FIT_CENTER }
        if (applyMascot(img)) {
            view.addView(img, FrameLayout.LayoutParams(size, size, Gravity.CENTER))
            bubbleImage = img
        } else {
            view.background = gradient(Color.rgb(31, 22, 63), Color.rgb(63, 38, 116), 30f, Color.rgb(169, 135, 255))
            view.addView(label("◎", 36f, Color.rgb(234, 214, 255), true),
                FrameLayout.LayoutParams(-2, -2, Gravity.CENTER))
        }
        val p = overlayParams(size, size, touchable = true)
        placeAtDock(p)
        params = p
        view.setOnTouchListener(DragHandler(view, p))
        wm.addView(view, p)
        bubble = view
        popIn(view)
    }

    /** Drag anywhere, fling toward an edge, drop on the ✕ to hide, or tap to check. */
    private inner class DragHandler(private val view: View, private val p: WindowManager.LayoutParams) : View.OnTouchListener {
        private var downX = 0f
        private var downY = 0f
        private var startX = 0
        private var startY = 0
        private var dragging = false
        private var overTarget = false
        private var velocity: VelocityTracker? = null
        private val slop = dp(8)

        override fun onTouch(v: View, e: MotionEvent): Boolean {
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    snap?.cancel()
                    downX = e.rawX; downY = e.rawY; startX = p.x; startY = p.y
                    dragging = false; overTarget = false
                    velocity?.recycle()
                    velocity = VelocityTracker.obtain().also { it.addMovement(e) }
                    view.animate().scaleX(.9f).scaleY(.9f).setDuration(110).start()
                }
                MotionEvent.ACTION_MOVE -> {
                    velocity?.addMovement(e)
                    val dx = e.rawX - downX
                    val dy = e.rawY - downY
                    if (!dragging && (abs(dx) > slop || abs(dy) > slop)) {
                        dragging = true
                        dismissPanel()
                        view.animate().scaleX(1.06f).scaleY(1.06f).setDuration(140).start()
                        showDismissZone(true)
                    }
                    if (dragging) {
                        val s = screen()
                        val size = bubbleSize()
                        val nowOver = isOverTarget(e.rawX, e.rawY, s)
                        if (nowOver != overTarget) {
                            overTarget = nowOver
                            view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
                            dismissCircle?.animate()?.scaleX(if (nowOver) 1.25f else 1f)
                                ?.scaleY(if (nowOver) 1.25f else 1f)?.setDuration(140)?.start()
                        }
                        if (nowOver) {
                            // Magnet: the bubble locks onto the ✕ while the finger is near it.
                            val c = targetCenter(s)
                            p.x = c.first - size / 2
                            p.y = c.second - size / 2
                        } else {
                            p.x = (startX + dx.roundToInt()).coerceIn(0, s.width - size)
                            p.y = (startY + dy.roundToInt()).coerceIn(s.insets.top, s.height - s.insets.bottom - size)
                        }
                        safeUpdate(view, p)
                    }
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    velocity?.addMovement(e)
                    velocity?.computeCurrentVelocity(1000)
                    val vx = velocity?.xVelocity ?: 0f
                    val vy = velocity?.yVelocity ?: 0f
                    velocity?.recycle(); velocity = null
                    view.animate().scaleX(1f).scaleY(1f).setDuration(160).start()
                    showDismissZone(false)
                    when {
                        dragging && overTarget -> dismissFromDrag(view)
                        dragging -> settle(vx, vy)
                        e.actionMasked == MotionEvent.ACTION_UP -> v.performClick()
                    }
                    dragging = false
                }
            }
            return true
        }
    }

    /** Glide to the nearest edge, carrying a little of the fling's momentum, then remember it. */
    private fun settle(vx: Float, vy: Float) {
        val view = bubble ?: return
        val p = params ?: return
        val s = screen()
        val size = bubbleSize()
        val (minX, minY, maxX, maxY) = dockBounds(s)
        val projectedX = p.x + size / 2 + vx * .12f
        val left = projectedX < s.width / 2f
        val endX = if (left) minX else maxX
        val endY = (p.y + vy * .08f).roundToInt().coerceIn(minY, maxY)
        BubbleSettings.setDock(this, BubbleSettings.Dock(left,
            if (maxY > minY) (endY - minY).toFloat() / (maxY - minY) else 0f))
        val fromX = p.x
        val fromY = p.y
        snap?.cancel()
        if (!ValueAnimator.areAnimatorsEnabled()) {
            // Animations are off (reduced motion): jump straight to the edge.
            p.x = endX; p.y = endY; safeUpdate(view, p); return
        }
        snap = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 360
            interpolator = OvershootInterpolator(.8f)
            addUpdateListener {
                val f = it.animatedValue as Float
                p.x = (fromX + (endX - fromX) * f).roundToInt().coerceIn(0, s.width - size)
                p.y = (fromY + (endY - fromY) * f.coerceAtMost(1f)).roundToInt()
                safeUpdate(view, p)
            }
            start()
        }
    }

    private fun dismissFromDrag(view: View) {
        view.performHapticFeedback(HapticFeedbackConstants.CONFIRM.takeIf { Build.VERSION.SDK_INT >= 30 }
            ?: HapticFeedbackConstants.LONG_PRESS)
        view.animate().scaleX(0f).scaleY(0f).alpha(0f).setDuration(180)
            .setListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    BubbleSettings.setEnabled(this@OverlayService, false)
                    stopSelf()
                }
            }).start()
    }

    private fun placeAtDock(p: WindowManager.LayoutParams) {
        val (minX, minY, maxX, maxY) = dockBounds(screen())
        val dock = BubbleSettings.dock(this)
        p.x = if (dock.left) minX else maxX
        p.y = (minY + (maxY - minY) * dock.fraction).roundToInt()
    }

    /** Where the bubble's top-left may rest: clear of status bar, nav bar and cutouts. */
    private fun dockBounds(s: Screen): List<Int> {
        val size = bubbleSize()
        val margin = dp(8)
        val minY = s.insets.top + margin
        return listOf(s.insets.left + margin, minY,
            s.width - s.insets.right - size - margin,
            maxOf(minY, s.height - s.insets.bottom - size - dp(72)))
    }

    private fun popIn(view: View) {
        view.alpha = 0f; view.scaleX = .6f; view.scaleY = .6f
        view.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(260)
            .setInterpolator(OvershootInterpolator(1.4f)).setListener(null).start()
    }

    private fun applyMascot(img: ImageView): Boolean {
        val bmp = BubbleSettings.loadMascot(this, BubbleSettings.visibility(this)) ?: return false
        img.setImageBitmap(bmp)
        return true
    }
    // Hidden instantly (no fade) so the bubble never appears in the captured frame.
    private fun hideBubble() { snap?.cancel(); bubble?.visibility = View.INVISIBLE; dismissPanel() }
    private fun requestCapture() {
        dismissPanel()
        startActivity(Intent(this, CaptureActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    // ---- Drag-to-hide target -----------------------------------------------------------------

    private fun dismissZoneHeight() = dp(190)

    private fun rebuildDismissZone() {
        val existing = dismissZone
        val s = screen()
        val zoneHeight = dismissZoneHeight()
        val p = overlayParams(WindowManager.LayoutParams.MATCH_PARENT, zoneHeight, touchable = false)
        p.y = s.height - zoneHeight
        if (existing != null) { safeUpdate(existing, p); positionCircle(s); return }
        val zone = FrameLayout(this).apply {
            background = GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP,
                intArrayOf(Color.argb(170, 9, 8, 21), Color.TRANSPARENT))
            visibility = View.GONE
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }
        val circle = label("✕", 22f, Color.WHITE, true).apply {
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.argb(220, 40, 30, 72))
                setStroke(dp(1), Color.rgb(150, 124, 230))
            }
        }
        zone.addView(circle, FrameLayout.LayoutParams(dp(56), dp(56), Gravity.CENTER_HORIZONTAL or Gravity.BOTTOM))
        zone.addView(label("Drop to hide", 11f, Muted, false),
            FrameLayout.LayoutParams(-2, -2, Gravity.CENTER_HORIZONTAL or Gravity.BOTTOM))
        try { wm.addView(zone, p); dismissZone = zone; dismissCircle = circle } catch (_: Exception) { return }
        positionCircle(s)
    }

    private fun positionCircle(s: Screen) {
        val zone = dismissZone ?: return
        val circle = dismissCircle ?: return
        val base = s.insets.bottom + dp(36)
        (circle.layoutParams as FrameLayout.LayoutParams).bottomMargin = base
        (zone.getChildAt(1).layoutParams as FrameLayout.LayoutParams).bottomMargin = base - dp(20)
        zone.requestLayout()
    }

    private fun showDismissZone(show: Boolean) {
        val zone = dismissZone ?: return
        if (show) {
            zone.visibility = View.VISIBLE
            zone.alpha = 0f
            zone.animate().alpha(1f).setDuration(160).setListener(null).start()
        } else {
            dismissCircle?.scaleX = 1f; dismissCircle?.scaleY = 1f
            zone.animate().alpha(0f).setDuration(140).setListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) { zone.visibility = View.GONE }
            }).start()
        }
    }

    private fun targetCenter(s: Screen) = Pair(s.width / 2, s.height - s.insets.bottom - dp(36) - dp(28))

    private fun isOverTarget(rawX: Float, rawY: Float, s: Screen): Boolean {
        val (cx, cy) = targetCenter(s)
        return hypot(rawX - cx, rawY - cy) < dp(72)
    }

    // ---- Result panel ------------------------------------------------------------------------

    private fun showResultPanel() {
        dismissPanel()
        if (!Settings.canDrawOverlays(this)) return
        val result = AnalysisSession.latest ?: return
        val s = screen()
        val width = minOf(s.width - s.insets.left - s.insets.right - dp(24), dp(420))
        val accent = when {
            result.status == EvidenceEngine.Status.ERROR -> Coral
            result.status == EvidenceEngine.Status.NO_TEXT -> Muted
            result.rung.priority >= EvidenceEngine.Rung.STRONG.priority -> Gold
            result.rung == EvidenceEngine.Rung.NONE -> Color.WHITE
            else -> Lavender
        }
        val outer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = gradient(Color.rgb(30, 23, 54), Color.rgb(14, 13, 28), 24f, Color.rgb(96, 72, 150))
            setPadding(dp(20), dp(18), dp(20), dp(10))
            if (Build.VERSION.SDK_INT >= 28) accessibilityPaneTitle = "ClariFi result"
        }
        val header = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        header.addView(label("CLARIFI  ·  SCREEN TEXT CHECK", 10.5f, Lavender, true).apply { letterSpacing = .12f },
            LinearLayout.LayoutParams(0, -2, 1f))
        if (result.status == EvidenceEngine.Status.OK) header.addView(chip(result.rung.label, accent))
        outer.addView(header)
        outer.addView(space(12))
        outer.addView(label(result.headline, 21f, accent, true))
        outer.addView(space(6))
        outer.addView(label(result.meaning, 13.5f, Color.rgb(226, 220, 240), false).apply { setLineSpacing(0f, 1.2f) })

        if (result.evidence.isNotEmpty()) {
            outer.addView(space(16))
            outer.addView(label("WHAT CLARIFI FOUND", 10f, Muted, true).apply { letterSpacing = .1f })
            result.evidence.take(5).forEach { ev ->
                outer.addView(space(9))
                outer.addView(evidenceRow(ev))
            }
        }

        outer.addView(space(14))
        outer.addView(divider())
        outer.addView(space(10))
        val source = when (result.status) {
            EvidenceEngine.Status.OK -> "Source: ${result.origin}  ·  ${result.wordCount} words read, nothing saved or uploaded"
            EvidenceEngine.Status.NO_TEXT -> "Source: ${result.origin}  ·  nothing saved or uploaded"
            EvidenceEngine.Status.ERROR -> "Nothing was saved or uploaded."
        }
        outer.addView(label(source, 11f, Muted, false))
        if (result.status != EvidenceEngine.Status.NO_TEXT) {
            outer.addView(space(4))
            outer.addView(label("ClariFi reads text only. It can't tell whether an image or video itself is AI-made.",
                11f, Muted, false))
        }
        outer.addView(space(6))
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        row.addView(action("Close", Muted) { dismissPanel() })
        row.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
        row.addView(action("Details", Lavender) {
            startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP))
            dismissPanel()
        })
        row.addView(space(6))
        row.addView(pill("Check again") { requestCapture() })
        outer.addView(row)

        val scroll = ScrollView(this).apply {
            isFillViewport = false
            isVerticalScrollBarEnabled = false
            addView(outer)
            // Tapping anywhere outside the card closes it.
            setOnTouchListener { _, e -> if (e.actionMasked == MotionEvent.ACTION_OUTSIDE) { dismissPanel(); true } else false }
        }
        // Anchor next to the bubble: below it when there is room, otherwise above it.
        outer.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.UNSPECIFIED)
        val bubbleTop = params?.y ?: (s.height / 3)
        val gap = dp(10)
        val spaceBelow = s.height - s.insets.bottom - (bubbleTop + bubbleSize() + gap) - dp(12)
        val spaceAbove = bubbleTop - gap - s.insets.top - dp(12)
        val below = outer.measuredHeight <= spaceBelow || spaceBelow >= spaceAbove
        val height = minOf(outer.measuredHeight, maxOf(dp(160), if (below) spaceBelow else spaceAbove))
        val p = overlayParams(width, height, touchable = true)
        p.flags = p.flags or WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH
        p.x = (s.width - width) / 2
        p.y = if (below) bubbleTop + bubbleSize() + gap else bubbleTop - gap - height
        try { wm.addView(scroll, p); panel = scroll } catch (_: Exception) { panel = null; return }
        if (ValueAnimator.areAnimatorsEnabled()) {
            scroll.alpha = 0f
            scroll.translationY = (if (below) -dp(8) else dp(8)).toFloat()
            scroll.animate().alpha(1f).translationY(0f).setDuration(200)
                .setInterpolator(DecelerateInterpolator()).start()
        }
    }

    private fun evidenceRow(ev: EvidenceEngine.Evidence): View {
        val row = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val color = if (ev.rung.priority >= EvidenceEngine.Rung.STRONG.priority) Gold else Lavender
        row.addView(label("${ev.kind.uppercase()}  ·  ${ev.rung.label.uppercase()}", 10f, color, true)
            .apply { letterSpacing = .08f })
        row.addView(label(ev.description, 13f, Color.WHITE, false).apply { setLineSpacing(0f, 1.15f) })
        return row
    }

    private fun dismissPanel() { panel?.let { try { wm.removeView(it) } catch (_: Exception) {} }; panel = null }

    // ---- Helpers -----------------------------------------------------------------------------

    private fun overlayParams(width: Int, height: Int, touchable: Boolean) = WindowManager.LayoutParams(
        width, height, WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
            WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
            (if (touchable) 0 else WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE),
        PixelFormat.TRANSLUCENT
    ).apply { gravity = Gravity.TOP or Gravity.START }

    private fun screen(): Screen {
        if (Build.VERSION.SDK_INT >= 30) {
            val m = wm.maximumWindowMetrics
            val i = m.windowInsets.getInsetsIgnoringVisibility(
                WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
            return Screen(m.bounds.width(), m.bounds.height(), Rect(i.left, i.top, i.right, i.bottom))
        }
        val dm = DisplayMetrics()
        @Suppress("DEPRECATION") wm.defaultDisplay.getRealMetrics(dm)
        return Screen(dm.widthPixels, dm.heightPixels, Rect(0, systemDimen("status_bar_height"), 0, systemDimen("navigation_bar_height")))
    }

    @Suppress("DiscouragedApi", "InternalInsetResource")
    private fun systemDimen(name: String): Int {
        val id = resources.getIdentifier(name, "dimen", "android")
        return if (id > 0) resources.getDimensionPixelSize(id) else dp(24)
    }

    private fun safeUpdate(view: View, p: WindowManager.LayoutParams) {
        try { wm.updateViewLayout(view, p) } catch (_: Exception) {}
    }

    private fun label(text: String, size: Float, color: Int, bold: Boolean) = TextView(this).apply {
        this.text = text
        setTextSize(size)
        setTextColor(color)
        if (bold) setTypeface(typeface, Typeface.BOLD)
        includeFontPadding = true
    }
    private fun chip(text: String, color: Int) = label(text.uppercase(), 10f, color, true).apply {
        letterSpacing = .1f
        setPadding(dp(10), dp(4), dp(10), dp(4))
        background = GradientDrawable().apply {
            cornerRadius = dp(20).toFloat()
            setColor(Color.argb(40, Color.red(color), Color.green(color), Color.blue(color)))
            setStroke(dp(1), Color.argb(120, Color.red(color), Color.green(color), Color.blue(color)))
        }
    }
    private fun action(title: String, color: Int, listener: () -> Unit) = label(title, 13.5f, color, true).apply {
        gravity = Gravity.CENTER
        minHeight = dp(48)
        setPadding(dp(10), 0, dp(10), 0)
        setOnClickListener { listener() }
    }
    private fun pill(title: String, listener: () -> Unit) = action(title, Color.WHITE, listener).apply {
        minHeight = dp(40)
        setPadding(dp(16), 0, dp(16), 0)
        background = GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,
            intArrayOf(Color.rgb(157, 122, 255), Color.rgb(94, 57, 215))).apply { cornerRadius = dp(20).toFloat() }
    }.also { it.layoutParams = LinearLayout.LayoutParams(-2, dp(40)) }
    private fun divider() = View(this).apply {
        setBackgroundColor(Color.argb(60, 194, 172, 255))
        layoutParams = LinearLayout.LayoutParams(-1, maxOf(1, dp(1) / 2))
    }
    private fun space(size: Int) = View(this).apply { layoutParams = LinearLayout.LayoutParams(dp(size), dp(size)) }
    private fun gradient(start: Int, end: Int, radius: Float, stroke: Int) = GradientDrawable(
        GradientDrawable.Orientation.TL_BR, intArrayOf(start, end)).apply {
        cornerRadius = dp(radius.toInt()).toFloat()
        setStroke(dp(1), stroke)
    }
    private fun dp(value: Int): Int = (value * resources.displayMetrics.density + .5f).toInt()
    override fun onDestroy() {
        snap?.cancel()
        dismissPanel()
        bubble?.let { try { wm.removeView(it) } catch (_: Exception) {} }
        dismissZone?.let { try { wm.removeView(it) } catch (_: Exception) {} }
        bubble = null
        bubbleImage = null
        dismissZone = null
        dismissCircle = null
        super.onDestroy()
    }
}
