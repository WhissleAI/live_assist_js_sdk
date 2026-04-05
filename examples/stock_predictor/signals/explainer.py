"""
Translate ML features into plain-English explanations that everyday users understand.
"""


class SignalExplainer:
    def explain(self, features: dict, direction: int, confidence: float) -> str:
        parts: list[str] = []
        action = "rise" if direction == 1 else "decline"

        div_sig = self._divergence_insight(features)
        if div_sig:
            parts.append(div_sig)

        emo_sig = self._emotion_insight(features)
        if emo_sig:
            parts.append(emo_sig)

        text_sig = self._text_insight(features)
        if text_sig:
            parts.append(text_sig)

        intent_sig = self._intent_insight(features)
        if intent_sig:
            parts.append(intent_sig)

        cross_sig = self._cross_call_insight(features)
        if cross_sig:
            parts.append(cross_sig)

        market_sig = self._market_insight(features)
        if market_sig:
            parts.append(market_sig)

        if not parts:
            parts.append(f"The model predicts a {action} based on a combination of voice and text patterns.")

        conf_str = f"{confidence * 100:.0f}%"
        intro = f"The model predicts a **{action}** with **{conf_str} confidence**."
        body = " ".join(parts)
        return f"{intro} {body}"

    def key_signals(self, features: dict) -> list[dict]:
        signals = []

        abs_div = features.get("abs_mean_divergence", 0)
        if abs_div > 0.15:
            signals.append({
                "label": "Voice-Text Mismatch",
                "value": round(abs_div, 3),
                "severity": "high" if abs_div > 0.25 else "moderate",
                "description": "Speaker's vocal tone contradicts their words",
            })

        nervous_rate = features.get("nervous_good_news_rate", 0)
        if nervous_rate > 0:
            signals.append({
                "label": "Nervous Good News",
                "value": round(nervous_rate, 3),
                "severity": "high" if nervous_rate > 0.1 else "moderate",
                "description": "Speaker sounds anxious while delivering positive statements",
            })

        deception = features.get("deception_signal_rate", 0)
        if deception > 0:
            signals.append({
                "label": "Deception Signal",
                "value": round(deception, 3),
                "severity": "high" if deception > 0.1 else "moderate",
                "description": "Pattern associated with misleading communication detected",
            })

        entropy = features.get("emotion_entropy", 0)
        if entropy > 1.5:
            signals.append({
                "label": "Emotional Instability",
                "value": round(entropy, 3),
                "severity": "moderate",
                "description": "Speaker shows unusually varied emotional states",
            })

        hedging = features.get("hedging_density", 0)
        ratio = features.get("confidence_hedging_ratio", 1)
        if hedging > 0.01:
            signals.append({
                "label": "Hedging Language" if ratio < 1 else "Confident Language",
                "value": round(ratio, 2),
                "severity": "moderate" if ratio < 0.5 else "low",
                "description": "More cautious/hedging words than confident ones" if ratio < 1 else "Speaker uses confident, assertive language",
            })

        polarity = features.get("text_sentiment_polarity", 0)
        if abs(polarity) > 0.1:
            label = "Positive Sentiment" if polarity > 0 else "Negative Sentiment"
            signals.append({
                "label": label,
                "value": round(polarity, 3),
                "severity": "low",
                "description": f"Overall textual sentiment is {'positive' if polarity > 0 else 'negative'}",
            })

        fear_spikes = features.get("fear_spike_count", 0)
        if fear_spikes > 0:
            signals.append({
                "label": "Fear Spikes",
                "value": int(fear_spikes),
                "severity": "high" if fear_spikes > 2 else "moderate",
                "description": f"{int(fear_spikes)} moments of elevated fear detected in voice",
            })

        q_ratio = features.get("intent_question_ratio", 0)
        if q_ratio > 0.3:
            signals.append({
                "label": "Heavy Questioning",
                "value": round(q_ratio, 3),
                "severity": "moderate",
                "description": "Analysts asked an unusually high proportion of probing questions",
            })

        cross_pol = features.get("cross_emotion_polarity_delta", 0)
        if abs(cross_pol) > 0.1:
            signals.append({
                "label": "Tone Shift vs Prior Call",
                "value": round(cross_pol, 3),
                "severity": "moderate",
                "description": f"CEO tone {'improved' if cross_pol > 0 else 'deteriorated'} vs previous quarter",
            })

        signals.sort(key=lambda s: {"high": 0, "moderate": 1, "low": 2}.get(s["severity"], 3))
        return signals[:6]

    def _divergence_insight(self, f: dict) -> str:
        abs_div = f.get("abs_mean_divergence", 0)
        nervous = f.get("nervous_good_news_rate", 0)
        deception = f.get("deception_signal_rate", 0)

        if abs_div < 0.1:
            return ""

        parts = []
        if abs_div > 0.2:
            parts.append(
                f"There is a **significant mismatch** between what the speakers are saying "
                f"and how they sound (divergence: {abs_div:.2f})."
            )
        else:
            parts.append(
                f"A moderate voice-text divergence ({abs_div:.2f}) was detected."
            )

        if nervous > 0:
            parts.append(
                f"Speakers sound nervous while delivering positive news {nervous:.0%} of the time."
            )
        if deception > 0:
            parts.append(
                f"Deception patterns detected in {deception:.0%} of segments."
            )

        return " ".join(parts)

    def _emotion_insight(self, f: dict) -> str:
        entropy = f.get("emotion_entropy", 0)
        fear_spikes = f.get("fear_spike_count", 0)
        neg_score = f.get("negative_emotion_score", 0)
        transition = f.get("emotion_transition_rate", 0)

        parts = []
        if entropy > 1.8:
            parts.append("The emotional tone is **highly variable**, suggesting uncertainty or discomfort.")
        elif entropy > 1.3:
            parts.append("Moderate emotional variation detected across the call.")

        if fear_spikes > 0:
            parts.append(f"**{int(fear_spikes)} fear spikes** were detected in the speaker's voice.")

        if neg_score > 0.1:
            parts.append(f"Negative emotional content is elevated ({neg_score:.1%}).")

        if transition > 0.4:
            parts.append("Speakers frequently shift emotional tone, indicating potential stress.")

        return " ".join(parts)

    def _text_insight(self, f: dict) -> str:
        polarity = f.get("text_sentiment_polarity", 0)
        hedging = f.get("hedging_density", 0)
        confidence = f.get("confidence_density", 0)
        ratio = f.get("confidence_hedging_ratio", 1)

        parts = []
        if ratio < 0.5 and hedging > 0.005:
            parts.append(
                "Management uses **significantly more hedging language** than confident assertions, "
                "suggesting caution about forward guidance."
            )
        elif ratio > 2 and confidence > 0.005:
            parts.append("Management uses **strongly confident language** in their statements.")

        if polarity > 0.2:
            parts.append("The overall textual sentiment is notably positive.")
        elif polarity < -0.1:
            parts.append("The textual sentiment skews negative.")

        return " ".join(parts)

    def _intent_insight(self, f: dict) -> str:
        q_ratio = f.get("intent_question_ratio", 0)
        q_shift = f.get("intent_question_shift", 0)
        transition = f.get("intent_transition_rate", 0)

        parts = []
        if q_ratio > 0.3:
            parts.append("Analysts asked an **unusually high number** of probing questions during this call.")

        if q_shift > 0.1:
            parts.append("Questioning **intensified in the second half**, suggesting growing skepticism.")

        if transition > 0.5:
            parts.append("Speakers frequently switched between statement types, suggesting defensive communication.")

        return " ".join(parts)

    def _cross_call_insight(self, f: dict) -> str:
        pol_delta = f.get("cross_emotion_polarity_delta", 0)
        hedge_delta = f.get("cross_hedging_delta", 0)
        deception_delta = f.get("cross_deception_delta", 0)
        prior_count = f.get("cross_prior_calls_count", 0)
        pol_trend = f.get("cross_polarity_trend", 0)

        if prior_count == 0:
            return ""

        parts = []
        if abs(pol_delta) > 0.1:
            direction = "more positive" if pol_delta > 0 else "more negative"
            parts.append(f"The CEO's emotional tone has shifted **{direction}** compared to the prior call.")

        if hedge_delta > 0.005:
            parts.append("Management is using **more hedging language** than in previous quarters.")
        elif hedge_delta < -0.005:
            parts.append("Management has **reduced hedging language**, showing increased conviction.")

        if abs(pol_trend) > 0.02:
            trend_dir = "improving" if pol_trend > 0 else "deteriorating"
            parts.append(f"Multi-quarter trend shows **{trend_dir}** emotional tone over {int(prior_count)} prior calls.")

        if deception_delta > 0.05:
            parts.append("Voice-text mismatch signals have **increased** since the prior call — a potential warning sign.")

        return " ".join(parts)

    def _market_insight(self, f: dict) -> str:
        vix_regime = f.get("mkt_vix_regime", 1)
        range_pct = f.get("mkt_price_range_pct", 0)
        vol_expansion = f.get("mkt_vol_expansion", 1)

        parts = []
        if vix_regime >= 2:
            parts.append("This analysis was made during a **high-volatility market regime** (VIX > 25), which increases uncertainty.")

        if range_pct > 0.03:
            parts.append(f"The stock had an **unusually wide intraday range** ({range_pct:.1%}) on the event day.")

        if vol_expansion > 2.0:
            parts.append("Post-event volatility **doubled** compared to pre-event levels.")

        return " ".join(parts)
