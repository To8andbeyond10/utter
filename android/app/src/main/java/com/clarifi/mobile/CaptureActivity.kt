package com.clarifi.mobile

import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import androidx.core.content.ContextCompat

/** System capture consent is requested for EACH bubble tap; no background screen monitoring. */
class CaptureActivity : Activity() {
    private val requestCode = 4107
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) {
            val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            @Suppress("DEPRECATION")
            startActivityForResult(manager.createScreenCaptureIntent(), requestCode)
        }
    }
    @Deprecated("Handled via the system MediaProjection consent result")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != this.requestCode) return
        if (resultCode == RESULT_OK && data != null) {
            // Android 14+ requires the user's approval BEFORE starting a mediaProjection FGS.
            startService(Intent(this, OverlayService::class.java).setAction(OverlayService.HIDE))
            val service = Intent(this, CaptureService::class.java)
                .putExtra(CaptureService.RESULT_CODE, resultCode)
                .putExtra(CaptureService.RESULT_DATA, data)
            ContextCompat.startForegroundService(this, service)
            // Return to the social app before any frame is acquired.
            moveTaskToBack(true)
        } else {
            startService(Intent(this, OverlayService::class.java).setAction(OverlayService.SHOW))
        }
        finish()
    }
}