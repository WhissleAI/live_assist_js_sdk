export interface AgentTheme {
  primaryColor: string;
  accentColor: string;
  bgStyle: "gradient" | "solid" | "emotion-reactive";
  showFloatingWords: boolean;
  showEmotionLabel: boolean;
}

export interface GoogleSheetsIntegration {
  sheet_id: string;
  sheet_name: string;
}

export interface AgentIntegrations {
  google_sheets?: GoogleSheetsIntegration;
}

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  avatar: string;

  voiceId: string;
  voiceName: string;
  ttsModel: string;
  language: string;
  defaultSpeed: number;

  systemPrompt: string;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  welcomeMessage: string;

  enabledTools: string[];
  knowledgeContext: string;

  enableEmotionDetection: boolean;
  enableEmotionTts: boolean;
  enableBargeIn: boolean;
  requireToolConfirmation: boolean;
  maxSessionMinutes: number;

  integrations: AgentIntegrations;
  theme: AgentTheme;

  createdAt: string;
  updatedAt: string;
  status: "draft" | "published";
}

export const DEFAULT_THEME: AgentTheme = {
  primaryColor: "#124e3f",
  accentColor: "#f59e0b",
  bgStyle: "emotion-reactive",
  showFloatingWords: true,
  showEmotionLabel: true,
};

export function createDefaultAgent(partial?: Partial<AgentConfig>): AgentConfig {
  const now = new Date().toISOString();
  return {
    id: `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: "New Agent",
    description: "",
    avatar: "🤖",
    voiceId: "cbaf8084-f009-4838-a096-07ee2e6612b1",
    voiceName: "Maya",
    ttsModel: "sonic-3",
    language: "en",
    defaultSpeed: 1.0,
    systemPrompt: "",
    model: "gemini-3-flash-preview",
    temperature: 0.7,
    maxOutputTokens: 2048,
    welcomeMessage: "Hello! How can I help you today?",
    enabledTools: [],
    knowledgeContext: "",
    enableEmotionDetection: true,
    enableEmotionTts: true,
    enableBargeIn: true,
    requireToolConfirmation: true,
    maxSessionMinutes: 0,
    integrations: {},
    theme: { ...DEFAULT_THEME },
    createdAt: now,
    updatedAt: now,
    status: "draft",
    ...partial,
  };
}

// Friendly labels — never expose raw model names to users
export const MODEL_OPTIONS: { value: string; label: string; description: string }[] = [
  { value: "gemini-3-flash-preview", label: "Fast", description: "Low latency, great for real-time conversations" },
  { value: "gemini-2.5-pro-preview-05-06", label: "Balanced", description: "Better reasoning with moderate speed" },
  { value: "gemini-2.5-pro-exp-03-25", label: "Advanced", description: "Strongest reasoning and instruction following" },
];

export function getModelLabel(model: string): string {
  return MODEL_OPTIONS.find((m) => m.value === model)?.label ?? "Fast";
}

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaults: Partial<AgentConfig>;
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: "customer_support",
    name: "Customer Support",
    description: "Helpful agent for answering product questions and resolving issues",
    icon: "🎧",
    defaults: {
      name: "Support Agent",
      avatar: "🎧",
      systemPrompt: `You are a friendly and professional customer support agent. Your goal is to help users resolve their issues quickly and thoroughly.

Guidelines:
- Be empathetic and patient
- Ask clarifying questions when the issue is unclear
- Provide step-by-step solutions
- Escalate gracefully when you cannot resolve an issue
- Always confirm the issue is resolved before ending`,
      welcomeMessage: "Hi there! I'm here to help. What can I assist you with today?",
      temperature: 0.5,
      enabledTools: ["web_search"],
    },
  },
  {
    id: "sales_rep",
    name: "Sales Representative",
    description: "Engaging agent for product demos and qualifying leads",
    icon: "💼",
    defaults: {
      name: "Sales Agent",
      avatar: "💼",
      systemPrompt: `You are a knowledgeable and engaging sales representative. Your goal is to understand the prospect's needs and demonstrate how your product can help.

Guidelines:
- Listen carefully to understand their pain points
- Ask discovery questions to qualify the lead
- Highlight relevant features and benefits
- Handle objections with empathy and data
- Guide toward next steps (demo, trial, meeting)`,
      welcomeMessage: "Welcome! I'd love to learn about your needs and show you how we can help. What brings you here today?",
      temperature: 0.7,
      enabledTools: [],
    },
  },
  {
    id: "technical_support",
    name: "Technical Support",
    description: "Expert agent for debugging and technical troubleshooting",
    icon: "🔧",
    defaults: {
      name: "Tech Support",
      avatar: "🔧",
      systemPrompt: `You are a technical support specialist with deep product knowledge. Help users diagnose and resolve technical issues.

Guidelines:
- Gather system info and error details upfront
- Walk through diagnostic steps methodically
- Explain technical concepts in accessible language
- Provide exact commands, configurations, or code when relevant
- Document the solution for the user's reference`,
      welcomeMessage: "Hello! I'm your technical support specialist. Can you describe the issue you're experiencing?",
      temperature: 0.3,
      enabledTools: ["web_search"],
    },
  },
  {
    id: "educational_tutor",
    name: "Educational Tutor",
    description: "Patient tutor that adapts to the learner's level",
    icon: "📚",
    defaults: {
      name: "Tutor",
      avatar: "📚",
      systemPrompt: `You are a patient and encouraging educational tutor. Adapt your explanations to the learner's level and learning style.

Guidelines:
- Assess the learner's current understanding
- Break complex concepts into digestible steps
- Use analogies and examples from everyday life
- Encourage questions and celebrate progress
- Check understanding before moving on`,
      welcomeMessage: "Hi! I'm your tutor. What would you like to learn about today?",
      temperature: 0.6,
      enabledTools: ["web_search"],
      enableEmotionDetection: true,
      enableEmotionTts: true,
    },
  },
  {
    id: "podcast_host",
    name: "Podcast Host",
    description: "Conversational interviewer for podcast-style discussions",
    icon: "🎙️",
    defaults: {
      name: "Podcast Host",
      avatar: "🎙️",
      systemPrompt: `You are a charismatic podcast host. You ask thought-provoking questions, listen actively, and guide engaging conversations.

Guidelines:
- Start with a warm, energetic introduction
- Ask open-ended follow-up questions
- Share relevant insights or anecdotes when appropriate
- Keep the conversation flowing naturally
- Summarize key takeaways at the end
- Be enthusiastic but authentic`,
      welcomeMessage: "Hey! Welcome to the show. I'm excited to chat with you. What topic should we dive into today?",
      temperature: 0.8,
      enabledTools: ["web_search"],
      enableEmotionTts: true,
    },
  },
  {
    id: "healthcare_intake",
    name: "Healthcare Intake",
    description: "Gentle agent for patient intake and symptom collection",
    icon: "🏥",
    defaults: {
      name: "Intake Assistant",
      avatar: "🏥",
      systemPrompt: `You are a healthcare intake assistant. Collect patient information and symptoms with care and empathy.

Guidelines:
- Be warm, gentle, and non-judgmental
- Ask one question at a time
- Collect: chief complaint, symptom duration, severity (1-10), relevant medical history
- Flag urgent symptoms immediately
- Reassure the patient throughout the process
- NEVER provide medical diagnoses or treatment recommendations`,
      welcomeMessage: "Hello, welcome. I'll help gather some information before your visit. How are you feeling today?",
      temperature: 0.4,
      enabledTools: ["flag_concern"],
      enableEmotionDetection: true,
    },
  },
  {
    id: "appointment_booking",
    name: "Appointment Booking",
    description: "Take bookings for plumbers, electricians, salons, clinics — saves to Google Sheets",
    icon: "📋",
    defaults: {
      name: "Booking Agent",
      avatar: "📋",
      systemPrompt: `You are a friendly and efficient appointment booking assistant. Your job is to collect all the information needed to book an appointment and save it.

Guidelines:
- Greet the caller warmly and ask what service they need
- Collect: full name, phone number, preferred date and time, service type, and any special notes
- Confirm all details back to the caller before saving
- Use save_to_sheet to record the booking with all collected fields
- After saving, confirm the booking is recorded and give a summary
- If the caller wants to check existing bookings, use read_from_sheet
- Be conversational and patient — many callers may be elderly or in a hurry
- If a time slot question comes up, use read_from_sheet to check for conflicts`,
      welcomeMessage: "Hi! I can help you book an appointment. What service are you looking for today?",
      temperature: 0.4,
      enabledTools: ["save_to_sheet", "read_from_sheet"],
      enableEmotionDetection: true,
      enableEmotionTts: true,
    },
  },
  {
    id: "lead_capture",
    name: "Lead Capture",
    description: "Qualify leads, collect contact info, and log everything to a spreadsheet",
    icon: "🎯",
    defaults: {
      name: "Lead Agent",
      avatar: "🎯",
      systemPrompt: `You are a professional lead qualification agent. Your goal is to understand the prospect's needs, collect their contact information, and save the lead.

Guidelines:
- Introduce yourself warmly and ask how you can help
- Ask qualifying questions: what they need, budget range, timeline, company size
- Collect: name, email, phone, company name, and their main interest
- Use save_to_sheet to record the lead with all gathered information
- Keep the conversation natural — don't make it feel like a form
- Summarize what you've captured and let them know someone will follow up`,
      welcomeMessage: "Welcome! I'd love to learn about what you're looking for so we can help. What brings you here?",
      temperature: 0.6,
      enabledTools: ["save_to_sheet", "read_from_sheet", "web_search"],
      enableEmotionTts: true,
    },
  },
  {
    id: "custom",
    name: "Custom Agent",
    description: "Start from scratch with a blank configuration",
    icon: "✨",
    defaults: {
      name: "My Agent",
      avatar: "✨",
    },
  },
];

export const AVAILABLE_TOOLS = [
  { id: "web_search", name: "Web Search", description: "Search the web for real-time information", icon: "🔍" },
  { id: "check_weather", name: "Weather", description: "Get current weather and forecast for a location", icon: "🌤️" },
  { id: "check_calendar", name: "Calendar", description: "Check upcoming calendar events and availability", icon: "📅" },
  { id: "create_calendar_event", name: "Create Event", description: "Schedule new events on Google Calendar", icon: "📆" },
  { id: "check_email", name: "Check Email", description: "Read recent Gmail inbox messages", icon: "📨" },
  { id: "send_email", name: "Send Email", description: "Send emails via the user's connected Gmail", icon: "✉️" },
  { id: "search_contacts", name: "Search Contacts", description: "Look up contacts by name for email or phone", icon: "👤" },
  { id: "search_memories", name: "Search Memories", description: "Recall past conversations, preferences, and decisions", icon: "🧠" },
  { id: "search_drive", name: "Search Drive", description: "Search Google Drive for documents and files", icon: "📁" },
  { id: "save_to_sheet", name: "Save to Sheet", description: "Save data (bookings, leads, orders) to Google Sheets in real-time", icon: "📝" },
  { id: "read_from_sheet", name: "Read from Sheet", description: "Read existing data from Google Sheets (check bookings, look up records)", icon: "📄" },
  { id: "fetch_news", name: "Fetch News", description: "Get latest news headlines on any topic", icon: "📰" },
  { id: "search_videos", name: "Search Videos", description: "Search YouTube for videos, music, and tutorials", icon: "🎬" },
  { id: "read_url", name: "Read Webpage", description: "Extract and read content from any URL", icon: "🌐" },
  { id: "translate_text", name: "Translate", description: "Translate text between languages", icon: "🌍" },
  { id: "calculate", name: "Calculate", description: "Math calculations, unit conversions, percentages", icon: "🧮" },
  { id: "get_stock_price", name: "Stock Price", description: "Look up real-time stock prices and changes", icon: "📈" },
  { id: "get_crypto_price", name: "Crypto Price", description: "Look up cryptocurrency prices", icon: "💰" },
  { id: "generate_image", name: "Generate Image", description: "Create images from text descriptions", icon: "🎨" },
  { id: "store_memory", name: "Store Memory", description: "Save preferences and decisions for future recall", icon: "🧠" },
  { id: "set_reminder", name: "Set Reminder", description: "Set reminders via Google Calendar alerts", icon: "⏰" },
  { id: "analyze_image", name: "Analyze Image", description: "Analyze and describe images from URLs using vision AI", icon: "👁️" },
  { id: "run_code", name: "Run Code", description: "Execute Python or JavaScript code in a sandbox", icon: "💻" },
  { id: "analyze_document", name: "Analyze Document", description: "Analyze uploaded documents (PDF, CSV, TXT)", icon: "📊" },
  { id: "analyze_audio", name: "Analyze Audio", description: "Transcribe and analyze audio files", icon: "🎵" },
  { id: "analyze_video", name: "Analyze Video", description: "Analyze video: visual description, transcription, emotions", icon: "🎥" },
  { id: "set_preference", name: "Set Preference", description: "Save user preferences (timezone, units, language)", icon: "⚙️" },
  { id: "schedule_recurring", name: "Schedule Task", description: "Schedule recurring or one-time tasks", icon: "🔄" },
  { id: "list_scheduled_tasks", name: "List Tasks", description: "Show active scheduled tasks", icon: "📋" },
  { id: "cancel_scheduled_task", name: "Cancel Task", description: "Cancel a scheduled task", icon: "❌" },
  { id: "flag_concern", name: "Flag for Review", description: "Flag a conversation moment for human review", icon: "🚩" },
];
