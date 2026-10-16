package com.clarifi.mobile

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat

private val Night = Color(0xFF090815)
private val Surface = Color(0xFF161329)
private val Lavender = Color(0xFFBCA8FF)
private val Muted = Color(0xFFAAA6BE)
private val Plum = Color(0xFF8259EF)
private val Light = Color(0xFFF5F0FF)

class MainActivity : ComponentActivity() {
    private var hasPermission by mutableStateOf(false)
    private var bubbleEnabled by mutableStateOf(false)
    private var pendingStart = false
    private var sharedText by mutableStateOf("")
    private var capturedResult by mutableStateOf<EvidenceEngine.Result?>(null)

    private val notificationPrompt = registerForActivityResult(ActivityResultContracts.RequestPermission()) { startBubble() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sharedText = readSharedText(intent)
        bubbleEnabled = BubbleSettings.isEnabled(this)
        setContent {
            MaterialTheme(colorScheme = darkColorScheme(primary = Lavender, surface = Surface)) {
                ClariFiHome(
                    sharedText = sharedText,
                    capturedResult = capturedResult,
                    permissionGranted = hasPermission,
                    running = bubbleEnabled,
                    onToggle = { if (bubbleEnabled) stopBubble() else requestBubble() },
                    onOpacity = { BubbleSettings.setOpacity(this, it); updateBubble() },
                    opacity = BubbleSettings.opacity(this)
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        sharedText = readSharedText(intent)
        capturedResult = AnalysisSession.latest
    }

    override fun onResume() {
        super.onResume()
        hasPermission = Settings.canDrawOverlays(this)
        capturedResult = AnalysisSession.latest
        if (pendingStart && hasPermission) {
            pendingStart = false
            askNotificationThenStart()
        }
    }

    private fun readSharedText(intent: Intent?): String =
        if (intent?.action == Intent.ACTION_SEND && intent.type == "text/plain")
            intent.getStringExtra(Intent.EXTRA_TEXT).orEmpty().take(12_000) else ""

    private fun requestBubble() {
        if (Settings.canDrawOverlays(this)) { askNotificationThenStart(); return }
        pendingStart = true
        startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:$packageName")))
    }
    private fun askNotificationThenStart() {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            notificationPrompt.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else startBubble()
    }
    private fun startBubble() {
        if (!Settings.canDrawOverlays(this)) return
        BubbleSettings.setEnabled(this, true)
        ContextCompat.startForegroundService(this, Intent(this, OverlayService::class.java).setAction(OverlayService.START))
        bubbleEnabled = true
    }
    private fun stopBubble() {
        BubbleSettings.setEnabled(this, false)
        startService(Intent(this, OverlayService::class.java).setAction(OverlayService.STOP))
        bubbleEnabled = false
    }
    private fun updateBubble() {
        if (bubbleEnabled) startService(Intent(this, OverlayService::class.java).setAction(OverlayService.REFRESH))
    }
}

@Composable
private fun ClariFiHome(
    sharedText: String,
    capturedResult: EvidenceEngine.Result?,
    permissionGranted: Boolean,
    running: Boolean,
    onToggle: () -> Unit,
    onOpacity: (Float) -> Unit,
    opacity: Float
) {
    val ctx = LocalContext.current
    var manualInput by remember { mutableStateOf("") }
    var analysis by remember { mutableStateOf<EvidenceEngine.Result?>(AnalysisSession.latest) }
    var alpha by remember { mutableFloatStateOf(opacity) }
    val motion = rememberInfiniteTransition(label = "mascot breath")
    val mascotScale by motion.animateFloat(
        initialValue = .975f, targetValue = 1.025f,
        animationSpec = infiniteRepeatable(tween(2600, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "mascot scale"
    )
    LaunchedEffect(capturedResult) { if (capturedResult != null) analysis = capturedResult }
    LaunchedEffect(sharedText) {
        if (sharedText.isNotBlank()) analysis = EvidenceEngine.analyze(sharedText, "Shared from another app")
    }

    Box(Modifier.fillMaxSize().background(Night)) {
        Canvas(Modifier.fillMaxSize()) {
            drawCircle(brush = Brush.radialGradient(listOf(Color(0x554A2BA1), Color.Transparent)),
                radius = size.width * 0.8f, center = Offset(size.width * .83f, size.height * .11f))
            drawCircle(brush = Brush.radialGradient(listOf(Color(0x33254DAE), Color.Transparent)),
                radius = size.width * .66f, center = Offset(0f, size.height * .69f))
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding()
            .navigationBarsPadding().padding(horizontal = 23.dp)) {
            Spacer(Modifier.height(28.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(36.dp).clip(RoundedCornerShape(12.dp))
                    .background(Brush.linearGradient(listOf(Plum, Color(0xFF4B33A9)))),
                    contentAlignment = Alignment.Center) {
                    Text("✦", color = Color.White, fontSize = 22.sp)
                }
                Spacer(Modifier.width(10.dp))
                Text("ClariFi", color = Light, fontWeight = FontWeight.Bold, fontSize = 22.sp, letterSpacing = (-.7).sp)
                Spacer(Modifier.weight(1f))
                Text("01 / BETA", color = Lavender, fontSize = 10.sp, letterSpacing = 1.6.sp)
            }
            Spacer(Modifier.height(28.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1.1f)) {
                    Text("CLARITY, ON DEMAND", fontSize = 10.sp,
                        color = Lavender, letterSpacing = 2.2.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(12.dp))
                    Text("Look closer.\nSee the signs.", fontSize = 35.sp, lineHeight = 39.sp,
                        letterSpacing = (-1.8).sp, fontWeight = FontWeight.Bold, color = Light)
                    Spacer(Modifier.height(10.dp))
                    Text("Reveal the evidence behind AI-content claims — right where you scroll.",
                        color = Muted, fontSize = 13.sp, lineHeight = 19.sp)
                }
                Box(Modifier.weight(.78f).height(188.dp), contentAlignment = Alignment.Center) {
                    MascotVisual(Modifier.fillMaxSize().graphicsLayer { scaleX = mascotScale; scaleY = mascotScale })
                }
            }
            Spacer(Modifier.height(25.dp))
            GlassPanel {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(9.dp).clip(CircleShape)
                        .background(if (running) Color(0xFF6EE7B7) else Color(0xFF8A819C)))
                    Spacer(Modifier.width(10.dp))
                    Text(if (running) "FLOATING ASSISTANT ACTIVE" else "FLOATING ASSISTANT OFF",
                        fontSize = 10.sp, color = Lavender, fontWeight = FontWeight.Bold,
                        letterSpacing = 1.1.sp)
                }
                Spacer(Modifier.height(12.dp))
                Text("Your lens on every app.", color = Light, fontWeight = FontWeight.Bold, fontSize = 22.sp)
                Spacer(Modifier.height(6.dp))
                Text("Tap the movable monocle bubble for a one-time screen check. You approve every capture.",
                    color = Muted, fontSize = 12.5.sp, lineHeight = 19.sp)
                Spacer(Modifier.height(18.dp))
                Box(Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(16.dp))
                    .background(Brush.horizontalGradient(listOf(Color(0xFF9D7AFF), Color(0xFF5E39D7))))
                    .clickable(onClick = onToggle), contentAlignment = Alignment.Center) {
                    Text(if (running) "Turn off floating button" else if (!permissionGranted) "Enable floating button · Allow access" else "Enable floating button",
                        color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                }
                if (running) {
                    Spacer(Modifier.height(17.dp))
                    Text("BUBBLE TRANSPARENCY", fontSize = 10.sp, color = Lavender, letterSpacing = 1.4.sp)
                    Slider(value = alpha, onValueChange = { alpha = it; onOpacity(it) },
                        valueRange = .3f..1f,
                        colors = SliderDefaults.colors(thumbColor = Lavender, activeTrackColor = Plum))
                    Text("${((1f - alpha) * 100).toInt()}% transparent", color = Muted, fontSize = 11.sp)
                }
            }
            Spacer(Modifier.height(18.dp))
            GlassPanel {
                Text("02  ·  QUICK CHECK", color = Lavender, fontSize = 10.sp,
                    letterSpacing = 1.7.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(9.dp))
                Text("Shared a post? Or paste its caption.", color = Light,
                    fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(12.dp))
                Box(Modifier.fillMaxWidth().heightIn(min = 92.dp).clip(RoundedCornerShape(12.dp))
                    .background(Color(0x99100E1C)).border(1.dp, Color(0xFF3A3154), RoundedCornerShape(12.dp))
                    .padding(13.dp)) {
                    BasicTextField(
                        value = manualInput,
                        onValueChange = { manualInput = it.take(12_000) },
                        textStyle = TextStyle(color = Light, fontSize = 13.sp, lineHeight = 19.sp),
                        modifier = Modifier.fillMaxWidth(), minLines = 3,
                        decorationBox = { inner ->
                            if (manualInput.isEmpty()) Text("Paste a caption, hashtag, or creator disclosure…",
                                color = Color(0xFF837E99), fontSize = 12.sp)
                            inner()
                        }
                    )
                }
                Spacer(Modifier.height(12.dp))
                Text("Analyze text  →", color = Lavender, fontSize = 14.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.align(Alignment.End).clickable {
                        if (manualInput.isNotBlank()) analysis = EvidenceEngine.analyze(manualInput, "Pasted text")
                    }.padding(8.dp))
            }
            if (analysis != null) {
                Spacer(Modifier.height(18.dp))
                ResultCard(analysis!!)
            }
            Spacer(Modifier.height(24.dp))
            Text("PRIVATE BY DESIGN  ·  SCREEN TEXT STAYS ON DEVICE", color = Color(0xFF7E759C),
                fontSize = 9.sp, letterSpacing = 1.sp,
                textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(35.dp))
        }
    }
}

@Composable
private fun GlassPanel(content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(24.dp)
    Column(Modifier.fillMaxWidth().clip(shape)
        .background(Brush.linearGradient(listOf(Color(0xEE23203B), Color(0xE617152C))))
        .border(1.dp, Brush.linearGradient(listOf(Color(0x885D4F83), Color(0x22564E74))), shape)
        .padding(19.dp), content = content)
}

@Composable
private fun ResultCard(result: EvidenceEngine.Result) {
    GlassPanel {
        Text("EVIDENCE BREAKDOWN", fontSize = 10.sp, color = Lavender, letterSpacing = 1.5.sp)
        Spacer(Modifier.height(8.dp))
        Text(result.rung.label, color = if (result.rung == EvidenceEngine.Rung.NONE) Light else Lavender,
            fontWeight = FontWeight.Bold, fontSize = 27.sp)
        Spacer(Modifier.height(4.dp))
        Text(result.origin, color = Muted, fontSize = 11.sp)
        Spacer(Modifier.height(12.dp))
        if (result.evidence.isEmpty()) {
            Text("No explicit AI text signals found. This does not verify that the content is human-made.",
                color = Light, fontSize = 12.sp, lineHeight = 18.sp)
        } else result.evidence.forEach { item ->
            Text("•  ${item.description}", color = Light, fontSize = 12.sp, lineHeight = 18.sp,
                modifier = Modifier.padding(bottom = 7.dp))
        }
        Spacer(Modifier.height(6.dp))
        Text("Textual indicators only · Not a deepfake detector or proof of origin.",
            color = Muted, fontSize = 11.sp, lineHeight = 16.sp)
    }
}

@Composable
private fun MascotVisual(modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val mascot = remember {
        try { ctx.assets.open("clarifi-mascot.png").use { BitmapFactory.decodeStream(it) } }
        catch (_: Exception) { null }
    }
    Box(modifier, contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            drawCircle(brush = Brush.radialGradient(listOf(Color(0x66764EE9), Color.Transparent)),
                radius = size.minDimension * .52f)
            drawCircle(color = Color(0x667E69BE), radius = size.minDimension * .4f,
                style = Stroke(width = 1.5.dp.toPx()))
        }
        if (mascot != null) {
            Image(bitmap = mascot.asImageBitmap(), contentDescription = "ClariFi monocle mascot",
                modifier = Modifier.fillMaxSize().padding(8.dp))
        } else {
            // Clean vector fallback only for standalone source delivery; repo build includes real mascot.
            Canvas(Modifier.size(120.dp)) {
                val s = size.minDimension
                drawCircle(Color(0xFFAC85FA), radius = s * .28f, center = Offset(s * .5f, s * .49f))
                drawRect(Color(0xFF27134F), topLeft = Offset(s * .22f, s * .17f),
                    size = Size(s * .56f, s * .14f))
                drawRect(Color(0xFF27134F), topLeft = Offset(s * .13f, s * .3f),
                    size = Size(s * .74f, s * .07f))
                drawCircle(Color(0xFFFFDF93), radius = s * .12f,
                    center = Offset(s * .62f, s * .47f), style = Stroke(width = s * .028f))
                drawLine(Color(0xFFFFDF93), Offset(s * .72f, s * .55f),
                    Offset(s * .79f, s * .79f), strokeWidth = s * .018f)
                drawCircle(Color(0xFF25153F), radius = s * .018f, center = Offset(s * .37f, s * .46f))
            }
        }
    }
}