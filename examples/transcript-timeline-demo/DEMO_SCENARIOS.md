# Live Assist — Demo Scenarios

Ten real-world personas showing how Live Assist tracks agenda, emotions, and provides live + post-session value. Each scenario includes **AI Instructions** — a custom prompt to paste into the Instructions field before starting the session.

---

## Scenario 1: Maya — Freelance UX Designer (Client Discovery Call)

**Mode:** `meeting`
**Who:** Maya (You / mic) ↔ David, Marketing Director at FreshBite Foods (Other / tab or second speaker)

### AI Instructions
```
You are assisting a freelance UX designer during a client discovery call. Focus on:
- Extracting specific pain points and metrics the client mentions (bounce rates, conversion numbers, broken features)
- Flagging when the client reveals budget ceiling, hard deadlines, or decision-makers
- Suggesting follow-up questions when the designer misses an opportunity to dig deeper
- Noting scope creep signals — when the client adds requirements beyond the original ask
- Tracking whether pricing and timeline have been explicitly agreed or left vague
Keep feedback concise and actionable. Prioritize capturing commitments and numbers.
```

### Agenda Items
1. Understand current website pain points
2. Discuss brand goals and target audience
3. Agree on project scope and timeline
4. Confirm budget range

### Dialogue Script

> **David:** Hey Maya, thanks for jumping on this call. So we've been running FreshBite's website for about three years now, and honestly, it's starting to show its age. Our bounce rate is through the roof — like forty-two percent on mobile.

> **Maya:** Forty-two percent, that's significant. Can you walk me through what a typical customer journey looks like right now? Like, someone lands on your homepage — what are they trying to do?

> **David:** Most people come in from Instagram ads. They're looking for our meal kit subscriptions. But the landing page still has this old layout where you have to scroll past our company story, our farm partners, all this stuff before you even see pricing. We know people are dropping off.

> **Maya:** Got it. So the conversion funnel is leaking at the top. Have you done any user testing or do you have heatmap data?

> **David:** We have Hotjar running. I can share the recordings. The biggest thing we noticed is people tap on the "Plans" button in the nav, but then the plans page loads slowly and the comparison table is broken on iPhone.

> **Maya:** That's really helpful context. Let me ask about the bigger picture — when you imagine the new site, what does success look like for FreshBite in, say, six months?

> **David:** We want to double our subscription sign-ups. Right now we're at about twelve hundred new subscribers a month. Our CEO wants twenty-five hundred by Q3. And we're launching a corporate catering line in April, so that needs its own section.

> **Maya:** Okay, so we're talking about two things — optimizing the existing subscription flow and building out a whole new section for corporate catering. That's good to know upfront because those are different user personas.

> **David:** Exactly. Our corporate buyers are office managers, they need bulk ordering, invoicing, dietary filters. Very different from the consumer side.

> **Maya:** Makes sense. In terms of timeline, when does the catering section need to be live?

> **David:** April fifteenth is the launch event. So we'd need at least the catering landing page and order flow by then. The full site redesign can be phased.

> **Maya:** That's tight but doable if we start next week. I'd propose a two-phase approach — phase one focused on catering launch, phase two on the full consumer site redesign through May and June.

> **David:** That works for us. What are we looking at budget-wise?

> **Maya:** For the scope we're discussing — the catering section, subscription flow optimization, and full redesign — I'd estimate somewhere between eighteen and twenty-five thousand, depending on how custom we go with the catering portal. I can put together a detailed proposal by Thursday.

> **David:** That's within our range. Our ceiling is thirty thousand, so there's room. Let's do the proposal and we can go from there.

> **Maya:** Perfect. I'll send over the proposal with phase breakdowns, timeline, and deliverables by end of day Thursday. Sound good?

> **David:** Sounds great. Really looking forward to this, Maya.

### What Live Assist Shows

| Feature | What Happens |
|---|---|
| **Agenda Tracking** | "Understand pain points" → completed (95%) after David describes bounce rate and mobile issues. "Brand goals" → completed (88%) after subscriber targets and catering launch. "Scope and timeline" → completed (82%) after two-phase agreement. "Budget" → completed (90%) after range confirmation. |
| **Emotion Timeline** | David: starts Neutral, shifts to Frustrated (describing broken mobile), back to Happy (hearing timeline works). Maya: steady Neutral/Happy throughout. |
| **Keywords (You)** | conversion funnel, heatmap, user personas, two-phase approach, proposal |
| **Keywords (Other)** | FreshBite, bounce rate, meal kit, Instagram ads, corporate catering, April fifteenth |
| **Intent Signals** | Maya: INFORM, QUESTION. David: INFORM, CONFIRM, REQUEST |
| **Post-Session Value** | Action items: Send proposal by Thursday. Key knowledge: Budget ceiling $30K, catering launch April 15, current subscribers 1,200/mo. |

---

## Scenario 2: Dr. Amara — Family Physician (Patient Follow-up)

**Mode:** `meeting` (or custom `consultation`)
**Who:** Dr. Amara (You / mic) ↔ Robert, 58-year-old patient (Other / second speaker)

### AI Instructions
```
You are assisting a family physician during a patient follow-up consultation. Focus on:
- Tracking every lab value mentioned (A1C, fasting glucose, eGFR, LDL, HDL) and whether it improved or worsened
- Flagging medication changes — name, dosage, reason for change, and side effects discussed
- Noting patient concerns or anxieties, especially unspoken ones (hesitation, tone shifts)
- Capturing lifestyle recommendations given and whether the patient committed to them
- Ensuring the follow-up timeline and next labs are explicitly confirmed
Use clinical precision. Never give medical advice — only summarize and track what the doctor says.
```

### Agenda Items
1. Review latest blood work results
2. Discuss medication adjustment
3. Address lifestyle and diet changes
4. Schedule next follow-up

### Dialogue Script

> **Dr. Amara:** Robert, good to see you. Come on in. So I got your lab results back from last Tuesday. Let's go through them together.

> **Robert:** Sure, doc. I've been a little nervous about it honestly. I tried to cut back on the carbs like you said, but the holidays didn't help.

> **Dr. Amara:** Understood, holidays are tough for everyone. So here's the good news — your A1C came down from eight point two to seven point four. That's meaningful progress.

> **Robert:** Oh wow, really? I thought it would be worse.

> **Dr. Amara:** No, you should feel good about that. Your fasting glucose is still a bit elevated at one forty-two, but the trend is clearly in the right direction. Your kidney function looks stable, eGFR is at seventy-eight, which is where we want it.

> **Robert:** What about the cholesterol? My wife's been on my case about that.

> **Dr. Amara:** Your LDL is at one thirty-eight, which is down from one fifty-two. Still above the target of one hundred for someone with your risk profile, but improving. Your HDL actually went up to forty-eight, which is great — that's the protective cholesterol.

> **Robert:** Okay. So the Metformin is working then?

> **Dr. Amara:** It is, but given where your A1C still sits, I'd like to add a low dose of Jardiance — that's empagliflozin. It works differently from Metformin. It helps your kidneys flush out excess sugar, and it actually has cardiovascular benefits too, which is a nice bonus for you.

> **Robert:** Are there side effects I should worry about?

> **Dr. Amara:** The main one is increased urination, especially the first couple weeks, and you need to stay hydrated. Some people get mild yeast infections. But for most patients, it's very well tolerated. I'd start you at ten milligrams daily.

> **Robert:** Alright, I trust you on this. Now, what about the diet? I've been trying to do the low-carb thing, but I'm not sure what I'm doing right or wrong.

> **Dr. Amara:** So your food log shows you've been doing well on weekdays — the overnight oats, the grilled chicken salads, that's all good. Where it breaks down is weekends and evenings. The Friday pizza nights, the beer — those are big glucose spikes.

> **Robert:** Yeah, that's my weak spot. The guys and I do poker night on Fridays.

> **Dr. Amara:** I'm not going to tell you to stop living your life. But can we negotiate? What if on poker night you switch to light beer — or even better, a whiskey neat — and do a thin crust pizza instead of deep dish? Small swaps, big difference.

> **Robert:** Ha, I can work with that. The guys will give me grief but they'll survive.

> **Dr. Amara:** Perfect. And I want you walking thirty minutes a day. Even a lunch break walk counts. That alone can drop your fasting glucose by fifteen to twenty points.

> **Robert:** I'll do it. I've actually been parking farther from the office.

> **Dr. Amara:** That's a great start. So here's my plan — we start the Jardiance this week, you continue the Metformin, we make those weekend diet swaps, and the daily walks. I want to see you back in eight weeks with fresh labs. We'll check A1C, kidney function, and lipids again.

> **Robert:** Eight weeks. I'll put it in my calendar. Thanks, doc. I actually feel better about this than I expected.

> **Dr. Amara:** You're doing the work, Robert. The numbers show it. We'll keep this trajectory going.

### What Live Assist Shows

| Feature | What Happens |
|---|---|
| **Agenda Tracking** | "Blood work review" → completed (95%) after full lab walkthrough. "Medication adjustment" → completed (90%) after Jardiance discussion. "Lifestyle changes" → completed (85%) after diet and exercise plan. "Schedule follow-up" → completed (92%) with 8-week return set. |
| **Emotion Timeline** | Robert: Anxious at start → Surprised/Happy (A1C improvement) → Concerned (side effects) → Relaxed/Happy by end. Dr. Amara: calm Neutral throughout with occasional Happy. |
| **Keywords (You)** | A1C, fasting glucose, Jardiance, empagliflozin, eGFR, LDL, ten milligrams, eight weeks |
| **Keywords (Other)** | carbs, holidays, cholesterol, Metformin, pizza night, poker, walking |
| **Intent Signals** | Dr. Amara: INFORM, SUGGEST, INSTRUCT. Robert: QUESTION, CONFIRM, COMMIT |
| **Post-Session Value** | Action items: Start Jardiance 10mg, labs in 8 weeks. Key knowledge: A1C 8.2→7.4, LDL 152→138, eGFR 78 stable. Weekend diet is the gap. |

---

## Scenario 3: Raj — Engineering Manager (Sprint Retrospective)

**Mode:** `meeting`
**Who:** Raj (You / mic) ↔ Team (Lisa, backend dev; Marco, frontend dev) (Other / tab — team on video call)

### AI Instructions
```
You are assisting an engineering manager running a sprint retrospective. Focus on:
- Tracking completed vs incomplete story points and the reasons for shortfall
- Capturing specific blockers mentioned — categorize as technical, process, or people issues
- Noting who owns each blocker and whether a resolution was proposed
- Flagging recurring themes if the same blocker appears multiple sprints
- Summarizing action items with explicit owners and deadlines
- Highlighting team morale signals — frustration, pride, disengagement
Keep suggestions focused on process improvements the manager can act on.
```

### Agenda Items
1. Review sprint velocity and completed stories
2. Identify what went well
3. Discuss blockers and what didn't go well
4. Agree on action items for next sprint

### Dialogue Script

> **Raj:** Alright team, let's jump into our sprint twenty-three retro. We had fourteen story points planned, and we completed eleven. Lisa, Marco — let's start with what went well.

> **Lisa:** The payment service migration to Stripe was the big win. We got it deployed to staging on Wednesday and it passed all the integration tests first try. That never happens.

> **Marco:** Yeah, and on the frontend side, the new checkout flow is live in the feature flag. I got the Stripe Elements integrated and the form validation is solid. We even handled the edge case with expired cards that kept biting us in the old system.

> **Raj:** That's great. So the Stripe migration is basically done then. What about the three points we didn't finish?

> **Lisa:** That was the webhook retry logic. I underestimated it. Stripe sends webhooks in a different order than I expected — like, you can get a payment_intent.succeeded before the charge.succeeded, and our system assumed a specific sequence.

> **Raj:** So it's a design issue, not a complexity issue?

> **Lisa:** Exactly. I need to refactor the event handler to be order-agnostic. I've got the approach mapped out, it's probably two days of work. I just ran out of runway this sprint.

> **Raj:** Okay, that carries over. What about blockers? Anything slowing you down that we can fix?

> **Marco:** The staging environment was down for almost a full day on Tuesday. DevOps said it was a Kubernetes pod memory issue. I lost most of that day because I couldn't test the checkout flow.

> **Raj:** That's frustrating. I'll escalate that with the platform team. We can't afford full-day staging outages during sprint work.

> **Lisa:** Also, the API documentation for our internal billing service is really outdated. I spent half a day reading the source code to figure out what the actual response format is. If we had accurate Swagger docs, that would've saved me four hours easily.

> **Raj:** Valid point. Let's make that an action item — Lisa, can you update the Swagger spec for the endpoints you touched? That way the next person doesn't hit the same wall.

> **Lisa:** Yeah, I can do that. I'll pair it with the webhook refactor since I'm already in that code.

> **Raj:** Perfect. Marco, anything else on your side?

> **Marco:** One thing — the design for the subscription management page came in late. I only got the Figma files on Thursday, so I couldn't start that story. It's not a dev blocker per se, but the design handoff timing is hurting us.

> **Raj:** That's fair. I'll talk to Sarah about getting designs delivered by Monday of the sprint week at the latest. We've had this problem two sprints in a row now.

> **Marco:** That would make a huge difference.

> **Raj:** Okay, let me summarize our action items. One — Lisa carries over the webhook retry logic, paired with Swagger doc updates. Two — I escalate staging stability with the platform team. Three — I align with Sarah on design handoff deadlines. Four — Marco picks up the subscription management page as the first story next sprint. Anything I'm missing?

> **Lisa:** Nope, that covers it.

> **Marco:** All good from me.

> **Raj:** Great retro, team. We shipped the Stripe migration — that's a big deal. Let's keep this momentum into sprint twenty-four.

### What Live Assist Shows

| Feature | What Happens |
|---|---|
| **Agenda Tracking** | "Sprint velocity review" → completed (90%) after 14 planned / 11 done. "What went well" → completed (92%) after Stripe migration success. "Blockers" → completed (88%) after staging outage, docs, design handoff. "Action items" → completed (95%) after explicit summary. |
| **Emotion Timeline** | Raj: Neutral → Happy (Stripe win) → Concerned (staging outage) → Resolved/Happy. Lisa: Happy (migration success) → Frustrated (docs waste). Marco: Happy → Frustrated (staging downtime, late designs) → Relieved. |
| **Keywords (You)** | sprint twenty-three, story points, webhook retry, platform team, design handoff, action items |
| **Keywords (Other)** | Stripe, payment service, Kubernetes, Swagger, Figma, subscription management, checkout flow |
| **Intent Signals** | Raj: QUESTION, SUMMARIZE, COMMIT. Lisa: INFORM, COMPLAIN, COMMIT. Marco: INFORM, COMPLAIN, CONFIRM |
| **Post-Session Value** | Action items: 4 clear items with owners. Key knowledge: 11/14 points completed, Stripe migration done, webhook carry-over ~2 days, staging reliability issue, design handoff SLA needed. |

---

## Scenario 4: Kenji — Real Estate Agent (Property Showing Debrief)

**Mode:** `meeting`
**Who:** Kenji (You / mic) ↔ Anita & Sam, a couple looking for their first home (Other)

### AI Instructions
```
You are assisting a real estate agent during a property showing debrief with buyers. Focus on:
- Tracking must-haves vs nice-to-haves for each buyer and which properties satisfy them
- Capturing specific property details — addresses, prices, square footage, issues noted
- Flagging emotional reactions to properties (excitement, disappointment, hesitation)
- Noting negotiation leverage points — days on market, seller motivation, repair needs
- Tracking financing status — pre-approval amount, rate, lender, expiration
- Summarizing next steps with specific dates (second viewings, offer deadlines)
Prioritize capturing numbers and commitments. Flag if a buyer is emotionally decided but hasn't addressed financial concerns.
```

### Agenda Items
1. Confirm must-haves vs nice-to-haves
2. Discuss the three properties visited today
3. Address financing and pre-approval status
4. Decide next steps — second viewings or new listings

### Dialogue Script

> **Kenji:** So we just walked through all three. Before we dive in, remind me — what are the absolute must-haves for you two?

> **Anita:** Three bedrooms minimum, a yard for the dog, and I really need a home office. Working from home is permanent for me now.

> **Sam:** And I need a garage. Doesn't have to be two-car, but I need somewhere for my tools and the bikes. And our budget ceiling is five-seventy-five.

> **Kenji:** Okay. Let's talk through what we saw. The first one on Maple Drive — the three bed, two bath listed at five forty-nine. What did you think?

> **Anita:** I loved the kitchen. That island was huge. But there's no office space. That third bedroom is tiny — I measured it, it's like eight by nine. My desk wouldn't even fit with the door open.

> **Sam:** The garage was solid though. Deep enough for a workbench. And the yard was fenced, which is great for Charlie.

> **Kenji:** What about the second one, the townhouse on Park Street at five twenty?

> **Sam:** That one's a no for me. No garage, no yard. It's a nice place but it doesn't check the boxes.

> **Anita:** Agreed. The finishes were beautiful but it's just not the right format for us.

> **Kenji:** Fair enough. And the third — the split-level on Birch Lane, five sixty-five?

> **Anita:** That's the one. The lower level is perfect for an office — it's quiet, it has its own bathroom down there. Three bedrooms upstairs, all decent size.

> **Sam:** The garage is a little narrow but it works. And the backyard is great — bigger than Maple Drive. My only concern is the roof. Those shingles looked old.

> **Kenji:** Good eye. The listing says the roof is from 2014, so it's about twelve years old. We'd want an inspection to assess remaining life. Could be a negotiation point if it needs replacing soon — that's a ten to fifteen thousand dollar item.

> **Sam:** Right. And the listing price is five sixty-five. Think there's room to negotiate?

> **Kenji:** It's been on market for twenty-two days. Average for this neighborhood is fourteen. So yes, I think we have leverage. I'd suggest coming in at five forty-five with an inspection contingency. Worst case they counter at five fifty-five and we're still under your ceiling.

> **Anita:** I like that strategy. Sam?

> **Sam:** Yeah, let's do it. But I want to walk through it one more time before we put in an offer. Can we do that this week?

> **Kenji:** Absolutely. I'll reach out to the listing agent today and try to get us in Wednesday or Thursday evening. Now, where are you with financing? You mentioned you started the pre-approval process.

> **Anita:** We got pre-approved through First National for five-eighty at four point six percent. The letter is valid for ninety days — we got it three weeks ago.

> **Kenji:** Perfect, that gives us plenty of runway. So here's the plan — I schedule the second viewing at Birch Lane this week, you walk through it again with fresh eyes, and if you still love it, we draft the offer Friday. Sound good?

> **Sam:** Let's do it.

### What Live Assist Shows

| Feature | What Happens |
|---|---|
| **Agenda Tracking** | "Must-haves vs nice-to-haves" → completed (92%) early in conversation. "Discuss properties" → completed (95%) all three reviewed. "Financing" → completed (88%) pre-approval confirmed. "Next steps" → completed (90%) second viewing + offer plan. |
| **Emotion Timeline** | Anita: Happy (kitchen on Maple) → Disappointed (small office) → Excited (Birch Lane office). Sam: Negative (townhouse) → Cautious (roof concern) → Decided/Happy (offer strategy). |
| **Keywords** | Maple Drive, Birch Lane, five forty-five, pre-approved, First National, inspection contingency, split-level |
| **Post-Session Value** | Action items: Schedule second viewing at Birch Lane, draft offer at $545K with inspection contingency. Key knowledge: pre-approved at $580K/4.6%, roof from 2014, 22 days on market. |

---

## Scenario 5: Priya — Job Candidate (Technical Interview)

**Mode:** `meeting`
**Who:** Priya (You / mic) ↔ Marcus, Senior Engineering Manager at Nexus Labs (Other / video call)

### AI Instructions
```
You are assisting a job candidate during a technical system design interview. Focus on:
- Tracking whether the candidate clarified requirements before jumping into design
- Noting each component of the design — data stores, message queues, APIs, caching layers
- Flagging trade-offs the candidate explicitly discussed vs ones they missed
- Capturing interviewer reactions — impressed, skeptical, probing deeper (these signal what matters)
- Noting questions the candidate asked about the team and role
- Summarizing strengths and gaps in the candidate's performance for self-review
After the session, suggest areas to study based on topics where the candidate was weakest or where the interviewer pushed back.
```

### Agenda Items
1. Walk through system design question
2. Discuss trade-offs and scaling concerns
3. Ask about team culture and growth
4. Clarify timeline and next steps

### Dialogue Script

> **Marcus:** Priya, welcome. So for the next forty-five minutes I'd like to walk through a system design problem. Let's say you're designing a real-time notification system for a social media app with fifty million daily active users. Where do you start?

> **Priya:** I'd start by clarifying requirements. When you say real-time, are we talking sub-second delivery or is a few seconds acceptable? And what types of notifications — push, in-app, email, all three?

> **Marcus:** Good questions. Let's say sub-two-second delivery for push and in-app. Email can be batched. And yes, all three channels.

> **Priya:** Okay. So at fifty million DAUs, if each user generates an average of, say, twenty events per day that could trigger notifications for their connections, and each user has on average three hundred connections — we're looking at potentially billions of fan-out operations daily. So the first thing I'd do is separate the notification pipeline into three stages: event ingestion, fan-out and routing, and delivery.

> **Marcus:** Walk me through fan-out. That's where it gets interesting.

> **Priya:** Right. For most users, I'd do fan-out on write — when someone posts, we immediately compute the recipient list and push notification jobs into a queue. But for celebrity accounts with millions of followers, fan-out on write is prohibitively expensive. So for users above, say, a hundred thousand followers, I'd switch to fan-out on read — their activity is stored centrally and followers pull it when they check notifications.

> **Marcus:** How do you decide the threshold? A hundred thousand is arbitrary.

> **Priya:** True. In practice I'd make it dynamic. You could use a cost model — if fan-out cost exceeds a threshold based on queue depth and processing time, that account gets flagged for read-based delivery. You'd want a background job that reclassifies accounts periodically, maybe daily.

> **Marcus:** What about the delivery layer? How do you handle push notifications at this scale?

> **Priya:** I'd use a WebSocket connection pool for in-app — each server maintains persistent connections to online users. For push, we're talking APNs and FCM. I'd batch push sends through a dedicated push service with its own rate limiting to respect Apple and Google's throttling. The key design choice is keeping delivery idempotent — every notification gets a UUID, and the client deduplicates on receipt.

> **Marcus:** What's your storage strategy?

> **Priya:** Notifications themselves I'd store in Cassandra — it handles high write throughput and the query pattern is simple, it's always by user ID sorted by timestamp. The notification preferences and delivery status I'd keep in Redis for fast lookups. And for the event bus connecting the stages, I'd use Kafka with topic partitioning by user ID hash to maintain ordering.

> **Marcus:** Good. What would you be most worried about in production?

> **Priya:** Thundering herd during major events — like a celebrity posts and fifty million people get notified. The fan-out on read helps there, but the delivery layer still needs circuit breakers and backpressure. I'd also worry about notification fatigue — at this scale you need smart aggregation. If someone gets forty likes in a minute, don't send forty push notifications. Batch it into "forty people liked your post."

> **Marcus:** That's a solid design. I'm impressed with the fan-out hybrid approach. Let me switch gears — do you have questions for me about the team?

> **Priya:** Yes, a few. What does the day-to-day look like for someone in this role? And how big is the team I'd be joining?

> **Marcus:** You'd be on the platform infrastructure team — eight engineers, mix of senior and mid-level. We own the messaging bus, the notification pipeline, and the real-time data layer. Day to day it's about seventy percent hands-on engineering, thirty percent design review and mentoring. We do two-week sprints with a lot of autonomy on how you spend your time.

> **Priya:** That sounds like a great fit. What does the interview process look like from here?

> **Marcus:** You've done the recruiter screen and now this system design round. Next would be a coding round — live pair programming, nothing adversarial — and then a behavioral round with our VP. We're trying to wrap up within two weeks. Our recruiter will follow up with scheduling by end of this week.

> **Priya:** Great, I appreciate that. Looking forward to the next steps.

### What Live Assist Shows

| Feature | What Happens |
|---|---|
| **Agenda Tracking** | "System design question" → completed (95%) thorough walkthrough. "Trade-offs and scaling" → completed (90%) fan-out hybrid, thundering herd, aggregation. "Team culture" → completed (82%) team size, split, autonomy. "Timeline" → completed (88%) two more rounds, two-week target. |
| **Emotion Timeline** | Priya: Focused/Neutral throughout → Confident (fan-out explanation) → Curious/Happy (asking about team). Marcus: Neutral → Impressed (hybrid approach comment) → Warm/Happy (team description). |
| **Keywords** | fan-out on write, fan-out on read, Cassandra, Redis, Kafka, WebSocket, APNs, FCM, idempotent, circuit breakers, fifty million DAU |
| **Post-Session Value** | Self-review: covered storage, delivery, scaling trade-offs. Missed: monitoring/observability, disaster recovery. Follow-up: coding round + behavioral round within 2 weeks. |

---

## Scenario 6: Coach Williams — High School Basketball (Halftime Talk)

**Mode:** `meeting`
**Who:** Coach Williams (You / mic) ↔ Assistant Coach Deb + players (Other)

### AI Instructions
```
You are assisting a basketball coach during a halftime talk. Focus on:
- Tracking specific defensive and offensive adjustments called — who does what differently
- Capturing stats mentioned (shooting percentages, turnovers, fouls) and what they imply
- Noting player-specific instructions and whether each player acknowledged them
- Flagging energy and morale — is the coach motivating, correcting, or both?
- Summarizing the tactical game plan for the second half in bullet-point form
- Highlighting opponent weaknesses identified (foul trouble, shaky ball handling, thin bench)
Keep feedback extremely concise — halftime is short. Prioritize the 3 most impactful adjustments.
```

### Agenda Items
1. Address defensive breakdowns from first half
2. Adjust offensive play calling
3. Set second-half energy and focus
4. Assign specific player matchups

### Dialogue Script

> **Coach Williams:** Alright, bring it in. We're down eight. That's nothing. But we're down eight because we're giving them easy buckets. Deb, what did you see on defense?

> **Deb:** Their number twelve is killing us on the pick and roll. Every time he sets the screen, Jaylen's going under it, and their guard is pulling up for an open three. They're four of six from three off that play alone — that's twelve points we just handed them.

> **Coach Williams:** Jaylen, you hearing this? You gotta go over the screen. Make their guard drive into help. Marcus is waiting at the rim — let them come to him. If you go under, they shoot. If you go over, they drive into our big. That's the trade we want.

> **Jaylen:** Got it, coach. Over the screen.

> **Coach Williams:** Good. Now on offense — we're settling. We took nine threes in the first half, made two. That's not us. Deb, what's the shot chart look like?

> **Deb:** We're twelve for twenty-two inside the arc and two for nine outside. Their interior defense is soft — their center picked up two fouls. He's in foul trouble and their backup is six-two. We should be attacking the paint every possession.

> **Coach Williams:** Exactly. Marcus, I want you posting up every chance you get. Their backup can't handle you. And the rest of you — drive and kick. If Marcus draws a double, the corner three is wide open. But don't settle for the three. Drive first, kick second, three only if you're wide open.

> **Marcus:** Coach, their four is fronting me in the post. I can't get position.

> **Coach Williams:** Then we lob it over the top. Tommy, when you see Marcus sealed on the front, throw the lob to the rim side. We practiced this. Marcus, you just hold your position and go up strong.

> **Tommy:** I got you.

> **Coach Williams:** Last thing — energy. They came out hot and we let it rattle us. Second half, first four minutes, I want full-court press. They've got a shaky point guard — he turned it over three times against half-court pressure. Full court will break him. We get two or three quick steals, this is a tie game.

> **Deb:** I agree. Their bench is thin too. If we push tempo, their starters will tire by the fourth quarter.

> **Coach Williams:** That's the gameplan. Defense — over the screen on twelve. Offense — attack the paint, post up Marcus, lob over the front. Energy — full court press for four minutes. Deb, you've got the matchup board. What are we switching?

> **Deb:** I'm putting Jaylen on their shooting guard instead — he's quicker laterally. Devon picks up number twelve. Devon's longer, he can contest over the screen better.

> **Coach Williams:** Love it. Alright team, hands in. We've got sixteen minutes. Play our game. One, two, three —

> **All:** TEAM!

### What Live Assist Shows

| Feature | What Happens |
|---|---|
| **Agenda Tracking** | "Defensive breakdowns" → completed (95%) pick-and-roll issue identified and fixed. "Offensive adjustments" → completed (92%) paint attack, post-up, lob play. "Energy and focus" → completed (88%) full-court press plan. "Player matchups" → completed (90%) Jaylen-Devon switch. |
| **Emotion Timeline** | Coach: Urgent/Frustrated (defensive issues) → Commanding/Confident (giving adjustments) → Energized (rally). Deb: Analytical/Neutral → Confident. Players: Attentive → Motivated. |
| **Keywords** | pick and roll, over the screen, foul trouble, shot chart, full-court press, lob, post up |
| **Post-Session Value** | Tactical record: defensive switches made, offensive scheme adjusted to paint-first. Key stat: 12/22 inside vs 2/9 outside. Their center in foul trouble. |

---

## Scenario 7: Elena — Immigration Lawyer (Client Consultation)

**Mode:** `meeting`
**Who:** Elena (You / mic) ↔ Tomás, a restaurant owner seeking an E-2 visa (Other)

### AI Instructions
```
You are assisting an immigration lawyer during a client consultation for an E-2 investor visa. Focus on:
- Tracking eligibility factors — treaty country nationality, investment amount, business viability, employee count
- Capturing every document mentioned and whether the client confirmed they have it
- Noting risk factors discussed — RFE likelihood, marginal business test, source-of-funds clarity
- Flagging anything the client says that could weaken the case (gaps in documentation, unclear fund sourcing)
- Tracking fee structure, retainer terms, and filing timeline
- Noting long-term immigration strategy discussed (E-2 limitations, green card pathways)
Be precise with legal terms and dollar amounts. Flag if the client commits to a timeline they may not meet.
```

### Agenda Items
1. Assess eligibility for E-2 investor visa
2. Review required documentation
3. Discuss timeline and potential risks
4. Agree on engagement and fees

### Dialogue Script

> **Elena:** Tomás, thanks for coming in. So from our initial call, you're looking at an E-2 investor visa to run your restaurant business here in the US. Let me ask some questions to assess where we stand. How much have you invested so far in the business?

> **Tomás:** I've put in about two hundred and ten thousand dollars. That covers the lease — it's a ten-year commercial lease in downtown Austin — kitchen buildout, equipment, and initial inventory. I have all the receipts and contracts.

> **Elena:** Two-ten is strong for an E-2. The threshold isn't fixed by law, but for a restaurant, I typically see approvals in the one-fifty to two-fifty range. The key test is that it's "substantial" relative to the total cost of the enterprise. What's the total cost to get the restaurant fully operational?

> **Tomás:** About two-sixty total. So I've put in roughly eighty percent of the total cost.

> **Elena:** That's excellent — eighty percent is well above what USCIS expects. Now, are you a citizen of a treaty country? You mentioned you're from Argentina.

> **Tomás:** Yes, Argentine citizen. I have my passport and my Argentine national ID.

> **Elena:** Argentina has an E-2 treaty with the US, so you qualify on the nationality requirement. Good. Now, the business — is it already operating or pre-revenue?

> **Tomás:** We opened three months ago. We're doing about forty-five thousand a month in revenue. I have eight employees — four full-time and four part-time.

> **Elena:** That's actually ideal. A functioning business with employees and revenue is much stronger than a startup plan. USCIS wants to see that the business is not "marginal" — meaning it generates enough income to support more than just your family. Eight employees makes that argument easy.

> **Tomás:** What documents do I need to put together?

> **Elena:** I'll give you a full checklist, but the core pieces are: your Argentine passport, proof of investment — bank statements showing the wire transfers, receipts, the lease agreement, equipment invoices — a detailed business plan even though the business is running, your tax returns or financial statements showing revenue, your employee payroll records, and photos of the restaurant. I'll also need a personal financial statement showing the source of funds — USCIS needs to see the money came from a legitimate source.

> **Tomás:** The money came from selling my restaurant in Buenos Aires. I have the sale contract and the bank records showing the funds transfer.

> **Elena:** Perfect, that's a clean source-of-funds story. Now let me be upfront about timeline and risks. Filing to approval typically takes four to six months right now. If we file with premium processing, we can get an initial decision in fifteen business days, but that costs an additional twenty-eight-oh-five on top of the regular filing fees.

> **Tomás:** What are the risks? What could go wrong?

> **Elena:** The most common issue is a Request for Evidence — an RFE. USCIS might ask for more proof that the business isn't marginal, or more detail on your role. But with your revenue numbers and employee count, I'd say your risk of denial is very low — maybe five to ten percent. The bigger strategic risk is that E-2 visas are renewable but not a direct path to a green card. If permanent residency is your long-term goal, we should discuss an EB-5 or an L-1A strategy in parallel.

> **Tomás:** For now the E-2 is what I need. We can discuss green card options later. What are your fees?

> **Elena:** My flat fee for a complete E-2 application — preparation, filing, and one RFE response if needed — is eight thousand five hundred dollars. Government filing fees are three-ten for the I-129, and the twenty-eight-oh-five if you want premium processing. I'll need a retainer of four thousand to start, with the balance due at filing.

> **Tomás:** That sounds reasonable. When can we start?

> **Elena:** We can start immediately. I'll send you the retainer agreement and the document checklist today. Once I have everything, I can have the petition ready to file within three weeks. Let's aim to file by mid-April.

> **Tomás:** Let's do it.

### What Live Assist Shows

| Feature | What Happens |
|---|---|
| **Agenda Tracking** | "Assess eligibility" → completed (95%) nationality, investment amount, marginality test passed. "Documentation" → completed (88%) full checklist covered. "Timeline and risks" → completed (90%) 4-6 months, RFE risk, green card caveat. "Fees" → completed (92%) $8,500 flat fee, retainer structure. |
| **Emotion Timeline** | Tomás: Anxious/Neutral → Relieved (eligibility confirmed) → Concerned (risks) → Decided/Happy. Elena: Confident/Neutral throughout, warm at close. |
| **Keywords** | E-2 visa, treaty country, Argentina, two hundred ten thousand, I-129, premium processing, RFE, marginal business, EB-5, retainer |
| **Post-Session Value** | Action items: Send retainer agreement and document checklist today. File by mid-April. Key knowledge: $210K invested (80% of total), 8 employees, $45K/mo revenue, source of funds from Buenos Aires restaurant sale. |

---

## Scenario 8: Professor Okafor — University Oral Exam

**Mode:** `meeting`
**Who:** Professor Okafor (You / mic) ↔ Student Mia, defending her master's thesis (Other)

### AI Instructions
```
You are assisting a professor conducting a master's thesis oral examination. Focus on:
- Tracking the research question, methodology, and key findings as stated by the student
- Noting each challenge or probe from the examiner and how well the student defended it
- Flagging weak defenses — where the student deflected, gave vague answers, or couldn't cite evidence
- Capturing statistical claims (sample sizes, p-values, effect sizes) and whether they're properly qualified
- Noting limitations the student acknowledges vs ones the examiner has to surface
- Tracking publication readiness — target journals mentioned, revisions needed
Summarize as: strengths, weaknesses, key questions raised, and recommended next steps.
```

### Agenda Items
1. Evaluate understanding of research methodology
2. Probe depth of findings and analysis
3. Test ability to defend limitations
4. Assess readiness for publication or further work

### Dialogue Script

> **Prof. Okafor:** Mia, congratulations on completing your thesis. Let's begin. Can you summarize your research question and why it matters?

> **Mia:** Thank you, Professor. My thesis examines how remote work policies affect employee creative output in mid-size technology companies. The question matters because most creativity research focuses on co-located teams, but since 2020, forty-seven percent of knowledge workers are hybrid or fully remote. We don't have good models for how physical separation impacts ideation and innovation.

> **Prof. Okafor:** Walk me through your methodology. Why did you choose a mixed-methods approach rather than purely quantitative?

> **Mia:** Creativity is notoriously hard to measure quantitatively. Patent counts or product launches are lagging indicators. So I used a convergent mixed-methods design — quantitative surveys measuring creative self-efficacy and team innovation climate across two hundred and twelve employees at six companies, combined with semi-structured interviews with thirty-two participants to understand the mechanisms behind the numbers.

> **Prof. Okafor:** Your survey response rate was sixty-one percent. Some reviewers might consider that borderline. How do you address potential non-response bias?

> **Mia:** I ran a wave analysis comparing early responders to late responders on key demographics — role level, tenure, remote work frequency. There were no statistically significant differences, which suggests the non-responders are likely similar to the responders. I also compared my sample demographics to company-provided workforce data and the distributions matched within three percentage points on gender, role level, and department.

> **Prof. Okafor:** Fair enough. Now, your central finding — that hybrid workers with two to three office days per week showed twenty-three percent higher creative output scores than fully remote workers. Did you control for self-selection? People who choose hybrid might already be more collaborative.

> **Mia:** Yes, that's the biggest threat to internal validity. I controlled for it in two ways. First, four of the six companies had mandatory return-to-office policies — employees didn't choose their schedule. So for that subset, it's quasi-experimental. Second, I included personality measures — openness, extraversion — as covariates in the regression. The hybrid effect held even after controlling for personality. The coefficient dropped from point-two-three to point-one-nine but remained significant at p less than point-oh-one.

> **Prof. Okafor:** Interesting. What about your qualitative findings? Did the interviews corroborate or complicate the quantitative results?

> **Mia:** They mostly corroborated but added nuance. The interviews revealed that it's not just about being in the office — it's about the quality of in-person time. Companies that used office days for deep collaborative work — workshops, brainstorming sessions — saw the creativity boost. Companies where office days were just "everyone sits at their desk but in the same building" saw no benefit. I call this the "structured serendipity" factor in the thesis.

> **Prof. Okafor:** "Structured serendipity" — I like that framing. Let's talk about limitations. What would you do differently if you had another year?

> **Mia:** Three things. First, I'd want longitudinal data — my study is cross-sectional, so I can show correlation but not definitively causation. A twelve-month panel study tracking the same teams through policy changes would be much stronger. Second, I'd expand beyond tech companies. My findings may not generalize to healthcare, finance, or creative industries where work patterns differ fundamentally. Third, I'd incorporate objective creativity measures — maybe expert ratings of actual work output rather than self-report scales.

> **Prof. Okafor:** Those are honest and well-considered limitations. Final question — is this ready for publication, and where would you submit?

> **Mia:** I believe the core finding is publishable. I'd target the Journal of Organizational Behavior or Organization Science. I'd want to tighten the methodology section based on your feedback today and expand the practical implications section for a managerial audience.

> **Prof. Okafor:** I agree. I think with revisions you have a strong submission. Well defended, Mia.

### What Live Assist Shows

| Feature | What Happens |
|---|---|
| **Agenda Tracking** | "Research methodology" → completed (95%) mixed-methods justified, non-response bias addressed. "Findings depth" → completed (92%) hybrid effect, covariates, qualitative nuance. "Defend limitations" → completed (90%) three clear limitations with solutions. "Publication readiness" → completed (85%) target journals identified. |
| **Emotion Timeline** | Mia: Nervous → Confident (methodology defense) → Thoughtful (limitations) → Relieved/Happy (positive assessment). Prof. Okafor: Analytical/Neutral → Skeptical (non-response, self-selection) → Impressed ("structured serendipity") → Warm (endorsement). |
| **Keywords** | mixed-methods, creative self-efficacy, non-response bias, self-selection, quasi-experimental, structured serendipity, Journal of Organizational Behavior, p less than point-oh-one |
| **Post-Session Value** | Assessment: Well-defended with honest limitations. Publication target: JOB or Organization Science. Needed revisions: tighten methodology, expand practical implications. Key finding: hybrid 2-3 days = +23% creative output (p<.01). |

---

## Scenario 9: Nina — Parent-Teacher Conference

**Mode:** `meeting`
**Who:** Nina, mother of 8-year-old Leo (You / mic) ↔ Mr. Torres, 3rd grade teacher (Other)

### AI Instructions
```
You are assisting a parent during a parent-teacher conference about their child. Focus on:
- Tracking academic performance by subject — what's strong, what's behind, and by how much
- Capturing specific assessments or test results mentioned (reading level, grade equivalents)
- Noting social dynamics — friendships, conflicts, behavioral patterns in class
- Flagging any learning concerns raised (reading difficulty, attention issues) and whether further evaluation was recommended
- Tracking the support plan — what the school will do, what the parent should do at home, and when to follow up
- Noting the parent's emotional state — are they reassured, worried, defensive?
Be empathetic in tone. Summarize with clear action items for both parent and teacher.
```

### Agenda Items
1. Understand Leo's academic progress
2. Discuss social behavior and friendships
3. Address the reading difficulty concern
4. Agree on support plan at home and school

### Dialogue Script

> **Mr. Torres:** Nina, thanks for coming in. Leo is a joy to have in class. Let me start with the positives — his math is outstanding. He's working at a fourth-grade level on multiplication and he's the first one done with problem sets. He also has a natural curiosity in science — during our weather unit, he built a barometer at home and brought it in. The other kids loved it.

> **Nina:** That makes me happy. He talks about science all the time at home. But I'm worried about reading. He seems to struggle with it and he's starting to avoid books altogether.

> **Mr. Torres:** You're right to flag that. His reading assessment from October puts him at a mid-second-grade level, which is about six months behind his peers. The specific issue is decoding — he has trouble breaking down unfamiliar multi-syllable words. His comprehension is actually strong when someone reads to him, which tells me the issue is phonics-based, not understanding.

> **Nina:** Is this something we should be concerned about long term? His father had dyslexia.

> **Mr. Torres:** Given the family history, I'd recommend we do a screening. We have a reading specialist, Mrs. Chen, who can do a thirty-minute assessment. It's not a diagnosis — only a psychoeducational evaluation can do that — but it will tell us if the patterns are consistent with dyslexia or if it's a developmental lag he'll grow out of.

> **Nina:** Yes, please set that up. What can I do at home in the meantime?

> **Mr. Torres:** A few things. First, don't stop reading to him — that keeps comprehension and vocabulary growing even while decoding catches up. Second, try paired reading — you read a sentence, he reads the next one. It takes the pressure off while building fluency. Third, audiobooks paired with the physical book — he follows along with his finger while listening. The Diary of a Wimpy Kid series is great for this age.

> **Nina:** He'd love that — he watches the movies already. What about at school?

> **Mr. Torres:** I've already moved him into our small-group phonics intervention — it's three times a week for twenty minutes. It focuses on syllable segmentation and vowel patterns, which is exactly where he's struggling. He's been in the group for two weeks and I'm already seeing small improvements in his willingness to try new words.

> **Nina:** That's encouraging. How is he socially? He's mentioned a boy named Diego who he says is mean to him.

> **Mr. Torres:** I'm aware of the Diego situation. It's not bullying per se — Diego is a strong personality and he can be bossy during group work. Leo tends to go quiet rather than assert himself. I've separated them for group activities and I'm doing some explicit social skills instruction around standing up for yourself respectfully. Leo has a solid friend group — he's close with Ava and James, they eat lunch together every day.

> **Nina:** That's reassuring. So the plan is — reading screening with Mrs. Chen, continue the phonics group, paired reading and audiobooks at home, and keep an eye on the Diego dynamic?

> **Mr. Torres:** Exactly. And let's check back in six weeks. If Mrs. Chen's screening suggests further evaluation, I'll connect you with the school psychologist. But let's take it one step at a time.

> **Nina:** Thank you, Mr. Torres. I feel a lot better having a plan.

### What Live Assist Shows

| Feature | What Happens |
|---|---|
| **Agenda Tracking** | "Academic progress" → completed (92%) math strong, reading flagged. "Social behavior" → completed (85%) Diego situation addressed, friend group confirmed. "Reading difficulty" → completed (95%) phonics deficit identified, screening planned. "Support plan" → completed (90%) home + school interventions agreed. |
| **Emotion Timeline** | Nina: Happy (math praise) → Worried (reading concern) → Anxious (dyslexia mention) → Relieved (plan in place). Mr. Torres: Warm/Positive → Honest/Careful (reading assessment) → Reassuring. |
| **Keywords** | decoding, phonics, dyslexia screening, Mrs. Chen, paired reading, audiobooks, Diary of a Wimpy Kid, syllable segmentation, Diego |
| **Post-Session Value** | Action items: Schedule Mrs. Chen screening, start paired reading and audiobooks at home, follow up in 6 weeks. Key knowledge: reading at mid-2nd grade level (6mo behind), math at 4th grade level, family history of dyslexia. |

---

## Scenario 10: Aisha — Therapist (Couples Counseling Session)

**Mode:** `meeting`
**Who:** Aisha, licensed therapist (You / mic) ↔ Jordan & Casey, married couple (Other)

### AI Instructions
```
You are assisting a licensed therapist during a couples counseling session. Focus on:
- Tracking homework compliance — did each partner complete last session's assignment? How?
- Noting the recurring pattern or core tension being explored this session
- Capturing each partner's emotional state and shifts throughout the session
- Flagging breakthrough moments — when a partner says something vulnerable or unexpected
- Noting defensive reactions, blame language, or stonewalling patterns
- Tracking new homework assignments — what each partner is asked to do, and whether they agreed
- Capturing the therapist's reframes or reflections that landed well
Maintain strict confidentiality framing. Never judge. Summarize with therapeutic progress notes: pattern identified, intervention used, response observed, homework set.
```

### Agenda Items
1. Check in on homework from last session
2. Explore the recurring argument pattern
3. Practice active listening exercise
4. Set new homework for next week

### Dialogue Script

> **Aisha:** Welcome back, both of you. Before we dive in, let's check in on the homework. Last week I asked you each to write down three things you appreciate about the other person and share them at some point during the week. How did that go?

> **Casey:** I did mine. I left a note on the bathroom mirror on Tuesday. I wrote that I appreciate how Jordan always makes coffee before I wake up, how he remembers my mom's birthday, and how patient he is with the dog when she chews his shoes.

> **Jordan:** I — honestly, I forgot until Thursday night. I told Casey over dinner. I said I appreciate that she always asks about my day, she handles the finances so I don't have to stress about it, and she's the reason we have any kind of social life because I'd just stay home.

> **Aisha:** Jordan, I notice you said you forgot. What got in the way?

> **Jordan:** Work was insane this week. I had back-to-back deadlines. I know that's an excuse, but it's honest.

> **Aisha:** I appreciate the honesty. Casey, how did it feel when you got Jordan's appreciation, even if it came later?

> **Casey:** It felt good, actually. But there's a part of me that was hurt he forgot. It's the pattern — I'm always the one who initiates the emotional stuff. He reciprocates when I push, but he doesn't lead with it.

> **Jordan:** That's not totally fair. I showed up to therapy. I'm here every week. That counts for something.

> **Casey:** I'm not saying it doesn't. I'm saying I need you to think of me without me having to ask you to think of me.

> **Aisha:** This is really important. Let me reflect back what I'm hearing. Casey, you're saying that the gesture matters, but the spontaneity of the gesture matters even more. It's not about whether Jordan appreciates you — it's about whether he demonstrates it without prompting. Jordan, you're saying your actions — like being here — are your way of showing commitment. Is that right?

> **Jordan:** Yeah. I'm not good with words. I never have been. But I'm trying.

> **Casey:** I know you're trying. I just — I grew up in a family where we said "I love you" twenty times a day. Your family didn't do that. I'm not asking you to be my family. I'm asking you to meet me somewhere in the middle.

> **Aisha:** I think you're both right, and this is the core tension we keep coming back to. Let's do something right now. I want you to turn and face each other. Jordan, I want you to tell Casey one specific moment from this past week where you thought about her and felt grateful. Not a general thing — a specific moment.

> **Jordan:** ... Okay. Wednesday night. You were on the phone with your sister, and she was going through it with her landlord situation. You were so patient with her, talking her through the legal stuff, finding her a tenant rights website. And I just thought — that's who Casey is. She drops everything for people. And I'm lucky she drops everything for me too.

> **Casey:** ... I didn't know you noticed that.

> **Jordan:** I notice more than you think. I just don't say it.

> **Aisha:** How did that land for you, Casey?

> **Casey:** That's exactly what I need. That right there. That's all I'm asking for.

> **Aisha:** This is a breakthrough moment. Jordan, that wasn't hard to say, was it?

> **Jordan:** No. It wasn't.

> **Aisha:** So the skill isn't generating the thought — you already have the thoughts. The skill is voicing them in real time instead of keeping them internal. That's your homework for this week. Once a day, when you notice something Casey does that you appreciate, say it out loud. Right in the moment. Don't save it up. Don't wait for the right time. Just say it.

> **Jordan:** I can do that.

> **Aisha:** Casey, your homework is to receive it without qualifying it. If Jordan says something appreciative, don't say "but you never used to do that." Just say thank you. Let it land.

> **Casey:** That's going to be hard for me. But okay.

> **Aisha:** I know it is. That's why it's homework and not something that comes naturally. Same time next week?

> **Both:** Yes.

### What Live Assist Shows

| Feature | What Happens |
|---|---|
| **Agenda Tracking** | "Check homework" → completed (90%) both reported, discussed. "Recurring pattern" → completed (92%) initiation imbalance surfaced. "Active listening exercise" → completed (95%) specific-moment exercise done, breakthrough. "New homework" → completed (88%) daily appreciation (Jordan), receive without qualifying (Casey). |
| **Emotion Timeline** | Casey: Warm → Hurt (forgot) → Frustrated (pattern) → Vulnerable → Moved (Wednesday moment). Jordan: Guarded → Defensive → Thoughtful → Tender (Wednesday story) → Resolved. Aisha: Warm/Neutral → Attentive → Affirming. |
| **Keywords** | appreciation, spontaneity, emotional initiation, active listening, breakthrough, homework, in the moment, receive without qualifying |
| **Post-Session Value** | Session notes: Core tension = initiation asymmetry. Breakthrough on real-time appreciation. Homework: Jordan voices appreciation daily in the moment, Casey receives without qualifying. Key insight: Jordan has the thoughts but doesn't vocalize them — skill gap, not feeling gap. |

---

## How to Use These Scenarios

### Live Demo (real-time)
Play a YouTube video or podcast as the audio source, or have two people read the dialogue aloud — one on mic, one on tab/speaker.

### Testing Agenda Tracking
Copy the agenda items into the setup screen before starting the session. Watch confidence scores climb as the conversation progresses through each topic.

### Post-Session
After stopping, the session report shows:
- Full transcript with per-segment emotion + intent badges
- Emotion donut charts for both speakers
- Keyword bags (entities extracted per speaker)
- Agenda completion summary with confidence and sentiment
- Feedback and suggested follow-ups

### Live Demo (real-time)
Play a YouTube video or podcast as the audio source, or have two people read the dialogue aloud — one on mic, one on tab/speaker.

### Testing Agenda Tracking
Copy the agenda items into the setup screen before starting the session. Watch confidence scores climb as the conversation progresses through each topic.

### Post-Session
After stopping, the session report shows:
- Full transcript with per-segment emotion + intent badges
- Emotion donut charts for both speakers
- Keyword bags (entities extracted per speaker)
- Agenda completion summary with confidence and sentiment
- Feedback and suggested follow-ups
