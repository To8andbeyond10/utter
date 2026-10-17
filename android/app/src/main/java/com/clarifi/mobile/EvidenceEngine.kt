package com.clarifi.mobile

/** Matches only explicit *textual* AI signals; not a classifier of pixels or authenticity. */
object EvidenceEngine {
    /**
     * How strong the *text* evidence is. Copy describes what the words say, never whether
     * the media itself is AI-made: ClariFi cannot judge pixels.
     */
    enum class Rung(val label: String, val priority: Int, val headline: String, val meaning: String) {
        NONE("No signal", 0, "No AI disclosure found",
            "The visible text doesn't mention AI. That doesn't mean the content is human-made."),
        POSSIBLE("Weak", 1, "A weak AI hint in the text",
            "Something in the text mentions AI, like a hashtag or label-like words. It isn't a clear disclosure."),
        LIKELY("Moderate", 2, "Several AI hints in the text",
            "Separate mentions of AI tools or tags appear together. It still isn't a direct disclosure."),
        STRONG("Strong", 3, "The text says it's AI-made",
            "The caption or text directly says an AI tool made this. ClariFi can't verify who wrote it."),
        CONFIRMED("Verified", 4, "Verified AI label",
            "A platform label that ClariFi could verify marks this as AI-generated.")
    }
    enum class Status { OK, NO_TEXT, ERROR }
    data class Evidence(val rung: Rung, val kind: String, val description: String)
    data class Result(
        val rung: Rung,
        val evidence: List<Evidence>,
        val origin: String,
        val excerpt: String,
        val status: Status = Status.OK,
        val wordCount: Int = 0,
        val error: String? = null
    ) {
        val headline: String get() = when (status) {
            Status.ERROR -> "Couldn't check this screen"
            Status.NO_TEXT -> "No readable text found"
            Status.OK -> rung.headline
        }
        val meaning: String get() = when (status) {
            Status.ERROR -> error ?: "Something went wrong."
            Status.NO_TEXT -> "There was no caption or label to read, or the app blocks screen capture. " +
                "ClariFi reads text only, so it can't judge the image or video itself."
            Status.OK -> rung.meaning
        }
    }

    fun failure(message: String, origin: String = "Screen check") =
        Result(Rung.NONE, emptyList(), origin, "", Status.ERROR, 0, message)

    private val tools = "(?:a\\.?i\\.?|artificial intelligence|midjourney|sora(?: ?2)?|veo(?: ?\\d)?|dall[ -]?e(?: ?\\d)?|stable ?diffusion|runway(?:ml)?|kling(?: ai)?|pika|adobe firefly|flux|grok(?: imagine)?|leonardo(?: ai)?|ideogram|chatgpt|gemini|imagen|luma|suno|udio|elevenlabs|heygen|synthesia)"
    private val disclosure = Regex(
        "\\b(?:made|created|generated|produced|rendered|animated|designed|voiced|composed)\\s+" +
            "(?:entirely\\s+|fully\\s+|completely\\s+)?(?:with|using|by|in|via|on)\\s+$tools\\b",
        RegexOption.IGNORE_CASE
    )
    private val negativeBefore = Regex("\\b(?:not|never|no|without|isn'?t|wasn'?t|aren'?t|weren'?t|zero)\\b[^.!?\\n]{0,30}$", RegexOption.IGNORE_CASE)
    private val phrase = Regex("\\b(?:ai[\\s-]generated|ai[\\s-]made|ai[\\s-]created|ai art(?:work)?|ai video|ai image)\\b", RegexOption.IGNORE_CASE)
    private val hashtag = Regex("#([\\p{L}\\p{N}_]{2,40})")
    private val aiTags = setOf(
        "aiart", "aiartwork", "aigenerated", "aigeneratedart", "aigeneratedimage",
        "aivideo", "aivideos", "aiimage", "aiimages", "aiphoto", "aiphotography",
        "aiartist", "aicreator", "aimodel", "aiinfluencer", "aianimation", "aifilm",
        "aimusic", "midjourney", "midjourneyart", "midjourneyai", "stablediffusion",
        "dalle", "dalle3", "sora", "soraai", "veo", "veo3", "kling", "klingai",
        "runwayml", "pikaart", "fluxai", "generativeart", "generativeai", "madewithai",
        "aicontent", "synthography"
    )
    private val uiLabels = Regex("\\b(?:AI info|Creator labeled as AI-generated|Altered or synthetic content)\\b", RegexOption.IGNORE_CASE)

    fun analyze(input: String, origin: String = "shared text"): Result {
        val text = input.take(12_000)
        val words = text.split(Regex("\\s+")).count { it.any(Char::isLetterOrDigit) }
        if (words == 0) return Result(Rung.NONE, emptyList(), origin, "", Status.NO_TEXT, 0)
        val evidence = mutableListOf<Evidence>()
        val found = disclosure.findAll(text).firstOrNull { match ->
            val before = text.substring(maxOf(0, match.range.first - 40), match.range.first)
            val sentenceTail = text.substring(match.range.first, minOf(text.length, match.range.first + 120))
                .takeWhile { it != '.' && it != '!' && it != '\n' }
            !negativeBefore.containsMatchIn(before) && !sentenceTail.contains('?')
        }
        if (found != null) {
            evidence += Evidence(Rung.STRONG, "Disclosure", "“${found.value.take(72)}”")
        }

        val tags = hashtag.findAll(text).map { it.groupValues[1].lowercase() }
            .filter { it in aiTags }.distinct().take(10).toList()
        if (tags.isNotEmpty()) {
            evidence += Evidence(Rung.POSSIBLE, "AI hashtags", tags.take(4).joinToString(" ") { "#$it" })
        }

        val aiPhrase = phrase.findAll(text).firstOrNull { m ->
            !negativeBefore.containsMatchIn(text.substring(maxOf(0, m.range.first - 40), m.range.first))
        }
        val phraseCounted = aiPhrase != null && found == null
        if (phraseCounted) evidence += Evidence(Rung.POSSIBLE, "Mentions AI", "“${aiPhrase!!.value}”")
        val uiLabel = uiLabels.find(text)
        if (uiLabel != null) {
            // OCR has no DOM provenance. Visible label text can be forged or merely quoted.
            evidence += Evidence(Rung.POSSIBLE, "Label-like text", "“${uiLabel.value}” (unverified: read from pixels, so it could be quoted or faked)")
        }
        val weakCount = tags.size + (if (phraseCounted) 1 else 0)
        if (weakCount >= 3 && found == null) {
            evidence += Evidence(Rung.LIKELY, "Combined", "$weakCount separate weak hints appear together")
        }
        val sorted = evidence.sortedByDescending { it.rung.priority }
        return Result(sorted.firstOrNull()?.rung ?: Rung.NONE, sorted, origin, text.take(220).trim(), Status.OK, words)
    }
}

/** In-memory only: OCR images and analysis results are not saved or uploaded. */
object AnalysisSession {
    @Volatile var latest: EvidenceEngine.Result? = null
}