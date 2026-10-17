package com.clarifi.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class EvidenceEngineTest {
    @Test fun directDisclosureIsStrong() {
        val r = EvidenceEngine.analyze("Video generated using Sora 2")
        assertEquals(EvidenceEngine.Rung.STRONG, r.rung)
    }
    @Test fun negatedDisclosureDoesNotFlag() {
        val r = EvidenceEngine.analyze("This was NOT made with AI. Shot on my phone.")
        assertEquals(EvidenceEngine.Rung.NONE, r.rung)
    }
    @Test fun questionIsNotDisclosure() {
        val r = EvidenceEngine.analyze("Was this made with Midjourney?")
        assertEquals(EvidenceEngine.Rung.NONE, r.rung)
    }
    @Test fun threeIndependentWeakTagsBecomeLikely() {
        val r = EvidenceEngine.analyze("#midjourney #aiart #sora")
        assertEquals(EvidenceEngine.Rung.LIKELY, r.rung)
    }
    @Test fun oneHashtagIsPossible() {
        val r = EvidenceEngine.analyze("#aiart")
        assertEquals(EvidenceEngine.Rung.POSSIBLE, r.rung)
    }
    @Test fun repeatedTagsDoNotInflateRank() {
        val r = EvidenceEngine.analyze("#aiart #aiart #aiart")
        assertEquals(EvidenceEngine.Rung.POSSIBLE, r.rung)
    }
    @Test fun aScreenshotLabelIsNeverAutomaticallyConfirmed() {
        val r = EvidenceEngine.analyze("AI info", "Screen text (OCR)")
        assertEquals(EvidenceEngine.Rung.POSSIBLE, r.rung)
        assertTrue(r.evidence.any { it.description.contains("unverified") })
    }
    @Test fun noSignalNeverMeansVerifiedHuman() {
        val r = EvidenceEngine.analyze("Sunset over the bay")
        assertEquals(EvidenceEngine.Rung.NONE, r.rung)
        assertTrue(r.meaning.contains("doesn't mean the content is human-made"))
    }
    @Test fun blankScreenIsNoTextNotAClearResult() {
        val r = EvidenceEngine.analyze("  \n ·  ", "text read from your screen on this device")
        assertEquals(EvidenceEngine.Status.NO_TEXT, r.status)
        assertEquals("No readable text found", r.headline)
    }
    @Test fun failureIsReportedAsAnErrorNotAsNoSignal() {
        val r = EvidenceEngine.failure("Screen capture wasn't approved, so nothing was read.")
        assertEquals(EvidenceEngine.Status.ERROR, r.status)
        assertEquals("Couldn't check this screen", r.headline)
        assertTrue(r.meaning.contains("wasn't approved"))
    }
    @Test fun wordsReadAreCounted() {
        val r = EvidenceEngine.analyze("Sunset over the bay #aiart")
        assertEquals(5, r.wordCount)
    }
    @Test fun noHeadlineClaimsTheMediaItselfIsAi() {
        EvidenceEngine.Rung.values().forEach { rung ->
            val copy = (rung.headline + " " + rung.meaning).lowercase()
            assertFalse(copy, copy.contains("this image is") || copy.contains("this video is") || copy.contains("deepfake"))
        }
    }
}