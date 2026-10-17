package com.clarifi.mobile

import org.junit.Assert.assertEquals
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
    }
}