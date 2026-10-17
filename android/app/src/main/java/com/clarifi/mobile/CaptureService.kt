package com.clarifi.mobile

import android.app.Activity
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.view.WindowManager
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions

/** One frame only. Bitmap, OCR, and results remain on device; no image files or network calls. */
class CaptureService : Service() {
    companion object {
        const val RESULT_CODE = "clarifi.resultCode"
        const val RESULT_DATA = "clarifi.resultData"
    }
    private val handler = Handler(Looper.getMainLooper())
    private var projection: MediaProjection? = null
    private var display: VirtualDisplay? = null
    private var reader: ImageReader? = null
    private var completed = false
    private var stopping = false

    override fun onBind(intent: Intent?): IBinder? = null
    @Suppress("DEPRECATION")
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = NotificationSupport.make(this, "ClariFi screen check", "Reading visible text once, on device")
        if (Build.VERSION.SDK_INT >= 34) startForeground(103, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        else startForeground(103, notification)
        val resultCode = intent?.getIntExtra(RESULT_CODE, Activity.RESULT_CANCELED) ?: Activity.RESULT_CANCELED
        val data: Intent? = if (Build.VERSION.SDK_INT >= 33) intent?.getParcelableExtra(RESULT_DATA, Intent::class.java)
            else intent?.getParcelableExtra(RESULT_DATA)
        if (resultCode != Activity.RESULT_OK || data == null) {
            finishError("Screen capture wasn't approved, so nothing was read.")
            return START_NOT_STICKY
        }
        try {
            val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            projection = manager.getMediaProjection(resultCode, data)
            projection!!.registerCallback(object : MediaProjection.Callback() {
                override fun onStop() { if (!completed && !stopping) finishError("Screen capture stopped before a frame arrived. Try again.") }
            }, handler)
            // Give the consent activity time to disappear, so we capture the previous app.
            handler.postDelayed({ beginCapture() }, 950)
        } catch (e: Exception) { finishError("Android didn't start the screen capture. Try again.") }
        return START_NOT_STICKY
    }

    private fun beginCapture() {
        if (stopping || completed) return
        try {
            val metrics = if (Build.VERSION.SDK_INT >= 30) {
                (getSystemService(WINDOW_SERVICE) as WindowManager).maximumWindowMetrics.bounds
            } else null
            val width = metrics?.width() ?: resources.displayMetrics.widthPixels
            val height = metrics?.height() ?: resources.displayMetrics.heightPixels
            val density = resources.displayMetrics.densityDpi
            if (width < 1 || height < 1) { finishError("ClariFi couldn't read the screen size. Try again."); return }
            reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)
            reader!!.setOnImageAvailableListener({ source ->
                if (completed || stopping) return@setOnImageAvailableListener
                val image = source.acquireLatestImage() ?: return@setOnImageAvailableListener
                val cropped = try {
                    val plane = image.planes[0]
                    val paddedWidth = width + (plane.rowStride - plane.pixelStride * width) / plane.pixelStride
                    val raw = Bitmap.createBitmap(paddedWidth, height, Bitmap.Config.ARGB_8888)
                    raw.copyPixelsFromBuffer(plane.buffer)
                    val result = Bitmap.createBitmap(raw, 0, 0, width, height)
                    raw.recycle()
                    result
                } catch (_: Exception) { null }
                finally { image.close() }
                if (cropped != null) { completed = true; recognize(cropped) }
                else finishError("The captured frame couldn't be read. Try again.")
            }, handler)
            display = projection!!.createVirtualDisplay("ClariFi one-time screen check", width, height, density,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader!!.surface, null, handler)
            handler.postDelayed({ if (!completed) finishError("No screen image arrived in time. Some apps block capture.") }, 6000)
        } catch (_: Exception) { finishError("This device blocked the screen capture.") }
    }

    private fun recognize(bitmap: Bitmap) {
        // Projection ends immediately after frame acquisition; OCR is independent of capture.
        releaseCapture()
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        try {
            recognizer.process(InputImage.fromBitmap(bitmap, 0))
                .addOnSuccessListener { text ->
                    val content = text.text
                    AnalysisSession.latest = EvidenceEngine.analyze(content, "text read from your screen on this device")
                    publish()
                }
                .addOnFailureListener { finishError("On-device text recognition failed. Try again.") }
                .addOnCompleteListener { bitmap.recycle(); recognizer.close() }
        } catch (_: Exception) {
            bitmap.recycle(); recognizer.close(); finishError("ClariFi couldn't analyze this screen. Try again.")
        }
    }
    private fun finishError(message: String) {
        if (stopping) return
        AnalysisSession.latest = EvidenceEngine.failure(message)
        publish()
    }
    private fun publish() {
        if (stopping) return
        stopping = true
        releaseCapture()
        if (BubbleSettings.isEnabled(this) && android.provider.Settings.canDrawOverlays(this)) {
            startService(Intent(this, OverlayService::class.java).setAction(OverlayService.RESULT))
        }
        stopSelf()
    }
    private fun releaseCapture() {
        display?.release(); display = null
        reader?.close(); reader = null
        if (projection != null) {
            val p = projection
            projection = null
            try { p?.stop() } catch (_: Exception) {}
        }
    }
    override fun onDestroy() { stopping = true; releaseCapture(); super.onDestroy() }
}