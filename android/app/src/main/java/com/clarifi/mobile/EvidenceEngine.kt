package com.clarifi.mobile

/** Matches only explicit *textual* AI signals; not a classifier of pixels or authenticity. */
object EvidenceEngine {
    enum class Rung(val label: String, val priority: Int) {
        NONE("No clear signal", 0), POSSIBLE("Possible", 1), LIKELY("Likely", 2),
        STRONG("Strong", 3), CONFIRMED("Confirmed", 4)
    }
    data class Evidence(val rung: Rung, val description: String)
    data class Result(val rung: Rung, val evidence: List<Evidence>, val origin: String, val excerpt: String)

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

    fun analyze(input: String, origin: String = "Shared text"): Result {
        val text = input.take(12_000)
        val evidence = mutableListOf<Evidence>()
        val found = disclosure.findAll(text).firstOrNull { match ->
            val before = text.substring(maxOf(0, match.range.first - 40), match.range.first)
            val sentenceTail = text.substring(match.range.first, minOf(text.length, match.range.first + 120))
                .takeWhile { it != '.' && it != '!' && it != '\n' }
            !negativeBefore.containsMatchIn(before) && !sentenceTail.contains('?')
        }
        if (found != null) {
            evidence += Evidence(Rung.STRONG, "Direct generation disclosure: “${found.value.take(72)}”")
        }

        val tags = hashtag.findAll(text).map { it.groupValues[1].lowercase() }
            .filter { it in aiTags }.distinct().take(10).toList()
        if (tags.isNotEmpty()) {
            evidence += Evidence(Rung.POSSIBLE, "AI-related hashtags: ${tags.take(4).joinToString { "#$it" }}")
        }

        val aiPhrase = phrase.findAll(text).firstOrNull { m ->
            !negativeBefore.containsMatchIn(text.substring(maxOf(0, m.range.first - 40), m.range.first))
        }
        val phraseCounted = aiPhrase != null && found == null
        if (phraseCounted) evidence += Evidence(Rung.POSSIBLE, "Mentions “${aiPhrase!!.value}”")
        val uiLabel = uiLabels.find(text)
        if (uiLabel != null) {
            // OCR has no DOM provenance. Visible label text can be forged or merely quoted.
            evidence += Evidence(Rung.POSSIBLE, "Visible label-like text: “${uiLabel.value}” (unverified)")
        }
        val weakCount = tags.size + (if (phraseCounted) 1 else 0)
        if (weakCount >= 3 && found == null) {
            evidence += Evidence(Rung.LIKELY, "Several independent weak text signals appear together")
        }
        val sorted = evidence.sortedByDescending { it.rung.priority }
        return Result(sorted.firstOrNull()?.rung ?: Rung.NONE, sorted, origin, text.take(220).trim())
    }
}

/** In-memory only: OCR images and analysis results are not saved or uploaded. */
object AnalysisSession {
    @Volatile var latest: EvidenceEngine.Result? = null
}