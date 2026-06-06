const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Global virtuals configuration
mongoose.set('toJSON', { virtuals: true });
mongoose.set('toObject', { virtuals: true });

// ── User Schema ───────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  whatsappNumber: { type: String },
  role: { type: String, enum: ['user', 'admin', 'subaccount', 'superadmin'], default: 'user' },
  isAdmin: { type: Boolean, default: false },
  subStatus: { type: String, enum: ['trial', 'active', 'expired', 'none'], default: 'none' },
  subExpiry: { type: Date, default: null },
  activePlan: { type: String, default: null },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  otp: { type: String },
  otpExpires: { type: Date },
  resetPasswordToken: { type: String },
  resetPasswordExpire: { type: Date },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.hasActiveSubscription = function () {
  if (this.role === 'superadmin' || this.role === 'admin' || this.isAdmin) return true;
  if (this.role === 'subaccount' || this.parentId) return true;
  
  if (this.subStatus === 'active' || this.subStatus === 'trial') {
    if (!this.subExpiry || new Date(this.subExpiry) > new Date()) return true;
  }
  return false;
};

const User = mongoose.model('User', userSchema);

// ── SuperAdmin Schema ─────────────────────────────────────────
const superAdminSchema = new mongoose.Schema({
  name: { type: String, required: true, default: 'Super Admin' },
  email: { type: String, required: true, unique: true },
  whatsappNumber: { type: String },
  password: { type: String, required: true },
  resetPasswordToken: { type: String },
  resetPasswordExpire: { type: Date },
  otp: { type: String },
  otpExpires: { type: Date },
}, { timestamps: true });

superAdminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
});

superAdminSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const SuperAdmin = mongoose.model('SuperAdmin', superAdminSchema);

// ── Contact Schema ────────────────────────────────────────────
const contactSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, default: '' },
  phone: { type: String, required: true },
  group: { type: String, default: 'Default' },
  tags: { type: [String], default: [] },
  source: { type: String, enum: ['manual', 'import', 'group_grab'], default: 'manual' },
  isWhatsApp: { type: Boolean, default: null },
  lastValidated: { type: Date },
  variables: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

contactSchema.index({ userId: 1, phone: 1 }, { unique: true });
const Contact = mongoose.model('Contact', contactSchema);

// ── Campaign Schema ───────────────────────────────────────────
const campaignSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  message: { type: String, required: true },
  mediaUrl: { type: String, default: '' },
  contacts: { type: Array, default: [] },
  results: { type: Array, default: [] },
  status: { type: String, enum: ['draft', 'running', 'completed', 'failed'], default: 'draft' },
  sent: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  delay: { type: Number, default: 3 },
  startedAt: { type: Date },
  finishedAt: { type: Date },
  isSuper: { type: Boolean, default: false },
}, { timestamps: true });

const Campaign = mongoose.model('Campaign', campaignSchema);

// ── AutoReply Schema ──────────────────────────────────────────
const autoReplySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  trigger: { type: String, required: true },
  triggerType: { type: String, enum: ['contains', 'exact', 'any'], default: 'contains' },
  response: { type: String, required: true },
  mediaUrl: { type: String, default: '' },
  active: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  delayHours: { type: Number, default: 24 },
  hitCount: { type: Number, default: 0 },
}, { timestamps: true });

const AutoReply = mongoose.model('AutoReply', autoReplySchema);

// ── Schedule Schema ───────────────────────────────────────────
const scheduleSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  message: { type: String, required: true },
  contacts: { type: Array, default: [] },
  targetGroups: { type: Array, default: [] },
  mediaUrl: { type: String, default: '' },
  cronExpr: { type: String, default: '' },
  scheduledAt: { type: Date },
  isRecurring: { type: Boolean, default: true },
  active: { type: Boolean, default: true },
  lastRun: { type: Date },
  runCount: { type: Number, default: 0 },
  isSuper: { type: Boolean, default: false },
}, { timestamps: true });

const Schedule = mongoose.model('Schedule', scheduleSchema);

// ── Project Schema ────────────────────────────────────────────
const projectSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  status: { type: String, enum: ['active', 'paused'], default: 'active' },
}, { timestamps: true });

const Project = mongoose.model('Project', projectSchema);

// ── Automation Schema ─────────────────────────────────────────
const automationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  name: { type: String, required: true },
  triggerType: { type: String, enum: ['manual', 'schedule'], default: 'manual' },
  scheduledAt: { type: Date },
  eventTime: { type: Date },
  status: { type: String, enum: ['active', 'paused', 'completed'], default: 'active' },
  targetGroups: { type: Array, default: [] },
  lastRunAt: { type: Date },
  isSuper: { type: Boolean, default: false },
}, { timestamps: true });

const Automation = mongoose.model('Automation', automationSchema);

// ── AutomationStep Schema ─────────────────────────────────────
const automationStepSchema = new mongoose.Schema({
  automationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Automation', required: true },
  stepOrder: { type: Number, required: true },
  actionType: { type: String, enum: ['send_message', 'delay'], required: true },
  message: { type: String, default: '' },
  mediaUrl: { type: String, default: '' },
  delayValue: { type: Number, default: 0 },
  delayUnit: { type: String, enum: ['minutes', 'hours', 'days'], default: 'minutes' },
  delayOption: { type: String, enum: ['duration', 'exact_time', 'event_time'], default: 'duration' },
  delayUntilDate: { type: Date },
  delayMinutes: { type: Number, default: 0 },
  eventWhen: { type: String, enum: ['before', 'after', 'exact'], default: 'exact' },
  eventOffsetDays: { type: Number, default: 0 },
  eventOffsetHours: { type: Number, default: 0 },
  eventOffsetMinutes: { type: Number, default: 0 },
  pastAction: { type: String, enum: ['proceed', 'skip'], default: 'proceed' }
}, { timestamps: false });

const AutomationStep = mongoose.model('AutomationStep', automationStepSchema);

// ── AutomationLog Schema ──────────────────────────────────────
const automationLogSchema = new mongoose.Schema({
  automationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Automation', required: true },
  groupId: { type: String, required: true },
  stepId: { type: mongoose.Schema.Types.ObjectId, ref: 'AutomationStep' },
  status: { type: String, enum: ['success', 'failed', 'pending'], default: 'pending' },
  error: { type: String, default: '' },
  executedAt: { type: Date, default: Date.now },
  scheduledNextAt: { type: Date, default: null }, // When the next action is expected after a delay
}, { timestamps: false });

const AutomationLog = mongoose.model('AutomationLog', automationLogSchema);

// ── GlobalVar Schema ──────────────────────────────────────────
const globalVarSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  key: { type: String, required: true },
  value: { type: String, required: true },
}, { timestamps: true });

const GlobalVar = mongoose.model('GlobalVar', globalVarSchema);

// ── Subscription Schema ───────────────────────────────────────
const subscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  plan: { type: String, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  status: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
  razorpayOrderId: { type: String },
  razorpayPaymentId: { type: String },
  razorpaySignature: { type: String },
  startDate: { type: Date },
  endDate: { type: Date },
  notes: { type: String, default: '' },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

const Subscription = mongoose.model('Subscription', subscriptionSchema);

// ── SupportTicket Schema ──────────────────────────────────────
const supportTicketSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subject: { type: String, required: true },
  message: { type: String, required: true },
  status: { type: String, enum: ['open', 'resolved', 'closed'], default: 'open' },
  adminReply: { type: String, default: '' },
}, { timestamps: true });

const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

// ── GroupsCache Schema ─────────────────────────────────────────
const groupsCacheSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  groups: [
    {
      id: { type: String, required: true },
      name: { type: String, default: 'Unknown Group' },
      participantCount: { type: Number, default: 0 },
      description: { type: String, default: '' },
    }
  ],
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

const GroupsCache = mongoose.model('GroupsCache', groupsCacheSchema);

// ── GroupParticipantsCache Schema ──────────────────────────────
const groupParticipantsCacheSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  groupId: { type: String, required: true },
  participants: [
    {
      phone: { type: String, required: true },
      isAdmin: { type: Boolean, default: false },
      isSuperAdmin: { type: Boolean, default: false }
    }
  ],
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

groupParticipantsCacheSchema.index({ userId: 1, groupId: 1 }, { unique: true });
const GroupParticipantsCache = mongoose.model('GroupParticipantsCache', groupParticipantsCacheSchema);

// ── WhatsAppSession Schema ──────────────────────────────────────
const whatsappSessionSchema = new mongoose.Schema({
  guid: { type: String, required: true, unique: true },
  sessionData: { type: Buffer, required: true },
  lastSaved: { type: Date, default: Date.now }
}, { timestamps: true });

const WhatsAppSession = mongoose.model('WhatsAppSession', whatsappSessionSchema);

module.exports = {
  User,
  Contact,
  Campaign,
  AutoReply,
  Schedule,
  Project,
  Automation,
  AutomationStep,
  AutomationLog,
  GlobalVar,
  Subscription,
  SuperAdmin,
  SupportTicket,
  GroupsCache,
  GroupParticipantsCache,
  WhatsAppSession
};
