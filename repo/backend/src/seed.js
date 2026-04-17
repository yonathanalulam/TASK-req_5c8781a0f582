const { connect, disconnect } = require('./config/db');
const env = require('./config/env');
const User = require('./models/User');
const Role = require('./models/Role');
const UserRoleAssignment = require('./models/UserRoleAssignment');
const ScopeAssignment = require('./models/ScopeAssignment');
const SecurityQuestion = require('./models/SecurityQuestion');
const ServiceCategory = require('./models/ServiceCategory');
const ServiceTag = require('./models/ServiceTag');
const ServiceCatalogEntry = require('./models/ServiceCatalogEntry');
const TagRuleVersion = require('./models/TagRuleVersion');
const SystemSetting = require('./models/SystemSetting');
const LeaseContract = require('./models/LeaseContract');
const BillingRuleVersion = require('./models/BillingRuleVersion');
const ShoeProfile = require('./models/ShoeProfile');
const Exception = require('./models/Exception');
const audit = require('./services/auditService');
const { hashPassword } = require('./utils/password');
const { rbac } = {}; // capability matrix lives in rbac.js; we only seed role codes here
const { DEFAULT_HOLIDAYS } = require('./utils/businessCalendar');
const barcode = require('./services/barcodeService');

async function upsertSecurityQuestions() {
  const qs = [
    'What is the name of your first pet?',
    'What city were you born in?',
    'What is your mother’s maiden name?',
    'What was the name of your first school?',
    'What is your favorite book title?',
  ];
  const out = [];
  for (const text of qs) {
    const existing = await SecurityQuestion.findOne({ text });
    out.push(existing || await SecurityQuestion.create({ text }));
  }
  return out;
}

async function upsertRoles() {
  const roles = [
    { code: 'student', name: 'Student' },
    { code: 'faculty_advisor', name: 'Faculty Advisor' },
    { code: 'corporate_mentor', name: 'Corporate Mentor' },
    { code: 'operations_staff', name: 'Operations Staff' },
    { code: 'department_admin', name: 'Department Admin', isSystem: true },
    { code: 'security_admin', name: 'Security Admin', isSystem: true },
    { code: 'job_runner', name: 'Job Runner', isSystem: true },
  ];
  for (const r of roles) await Role.updateOne({ code: r.code }, { $setOnInsert: r }, { upsert: true });
}

async function upsertUser({ username, password, displayName, roles, scopes = [], securityQuestionId, securityAnswer = 'default-answer' }) {
  let u = await User.findOne({ username });
  if (!u) {
    u = await User.create({
      username,
      displayName: displayName || username,
      passwordHash: await hashPassword(password),
      securityQuestionId,
      securityAnswerHash: await hashPassword(securityAnswer.toLowerCase()),
      roles,
      mustChangePassword: username === env.seedAdminUsername,
    });
    await audit.record({ actorUsername: 'seed', action: 'user.seed', entityType: 'User', entityId: u._id });
  }
  for (const roleCode of roles) {
    await UserRoleAssignment.updateOne(
      { userId: u._id, roleCode },
      { $setOnInsert: { userId: u._id, roleCode } },
      { upsert: true }
    );
  }
  for (const s of scopes) {
    await ScopeAssignment.updateOne(
      { userId: u._id, dimension: s.dimension, value: s.value },
      { $setOnInsert: { userId: u._id, dimension: s.dimension, value: s.value } },
      { upsert: true }
    );
  }
  return u;
}

async function upsertCatalog() {
  const cats = [
    { code: 'clean', name: 'Cleaning' }, { code: 'repair', name: 'Repair' },
    { code: 'polish', name: 'Polish' }, { code: 'dye', name: 'Dye' },
  ];
  for (const c of cats) await ServiceCategory.updateOne({ code: c.code }, { $setOnInsert: c }, { upsert: true });
  const tagValues = [
    { code: 'express', label: 'Express' }, { code: 'leather', label: 'Leather' },
    { code: 'suede', label: 'Suede' }, { code: 'premium', label: 'Premium' },
    { code: 'eco', label: 'Eco-friendly' },
  ];
  for (const t of tagValues) await ServiceTag.updateOne({ code: t.code }, { $setOnInsert: t }, { upsert: true });
  const services = [
    { code: 'basic-clean', name: 'Basic Clean', description: 'Surface clean and deodorize', categoryCode: 'clean', tags: ['express'], priceCents: 1500, estimatedDurationMinutes: 30 },
    { code: 'deep-clean', name: 'Deep Clean', description: 'Deep clean with leather conditioning', categoryCode: 'clean', tags: ['leather','premium'], priceCents: 3500, estimatedDurationMinutes: 90 },
    { code: 'sole-repair', name: 'Sole Repair', description: 'Replace worn sole', categoryCode: 'repair', tags: ['premium'], priceCents: 5000, estimatedDurationMinutes: 120 },
    { code: 'suede-clean', name: 'Suede Clean', description: 'Specialist suede cleaning', categoryCode: 'clean', tags: ['suede'], priceCents: 4000, estimatedDurationMinutes: 60 },
    { code: 'polish-shine', name: 'Polish & Shine', description: 'Mirror polish service', categoryCode: 'polish', tags: ['premium'], priceCents: 2500, estimatedDurationMinutes: 45 },
    { code: 'full-redye', name: 'Full Redye', description: 'Restore color with full redye', categoryCode: 'dye', tags: ['leather','premium'], priceCents: 8000, estimatedDurationMinutes: 180 },
  ];
  for (const s of services) {
    await ServiceCatalogEntry.updateOne({ code: s.code }, { $setOnInsert: s }, { upsert: true });
  }
}

async function upsertSystemSettings() {
  const items = [
    { key: 'businessCalendar', value: { timezone: env.timezone, holidays: DEFAULT_HOLIDAYS } },
    { key: 'currentKeyVersion', value: env.currentKeyVersion },
    { key: 'policies', value: {
      zeroPhotoIntakeAllowed: true,
      shiftDueDatesToNextBusinessDay: false,
    } },
  ];
  for (const s of items) await SystemSetting.updateOne({ key: s.key }, { $set: s }, { upsert: true });
}

async function upsertTagRules() {
  const existing = await TagRuleVersion.findOne({ tagCode: 'high_risk_exceptions' });
  if (!existing) {
    await TagRuleVersion.create({
      tagCode: 'high_risk_exceptions',
      versionNumber: 1,
      ruleType: 'exception_count_rolling',
      params: { windowDays: 14, minCount: 3 },
      active: true,
      immutable: false,
    });
  }
}

async function upsertDemoContract() {
  const number = 'DEMO-0001';
  let c = await LeaseContract.findOne({ contractNumber: number });
  if (!c) {
    c = await LeaseContract.create({
      contractNumber: number,
      facilityUnit: 'HQ-Unit-A',
      lessorName: 'Acme Properties',
      lesseeName: 'Meridian Ops',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 3600 * 1000), // expires in 30 days (dashboard bucket)
      status: 'active',
    });
  }
  const ruleExists = await BillingRuleVersion.findOne({ contractId: c._id });
  if (!ruleExists) {
    const rule = await BillingRuleVersion.create({
      contractId: c._id, versionNumber: 1, ruleType: 'fixed',
      fixedAmountCents: 250000, dueDayOfMonth: 1, effectiveFrom: new Date(),
    });
    c.currentBillingRuleVersionId = rule._id;
    await c.save();
  }
}

async function upsertDemoShoe(ownerId, staffId) {
  const existing = await ShoeProfile.findOne({ serial: 'DEMO-SERIAL-0001' });
  if (existing) return existing;
  const serial = 'DEMO-SERIAL-0001';
  const bc = await barcode.generateUniqueBarcode(ShoeProfile, serial);
  return ShoeProfile.create({
    serial, barcode: bc,
    ownerUserId: ownerId, intakeStaffUserId: staffId,
    brand: 'Acme', material: 'Leather', color: 'Brown', size: '10',
    status: 'intake_completed', intakeCompletedAt: new Date(),
  });
}

async function main() {
  await connect();
  console.log('[seed] connected');
  const qs = await upsertSecurityQuestions();
  const defaultQ = qs[0];
  await upsertRoles();
  await upsertCatalog();
  await upsertSystemSettings();
  await upsertTagRules();

  const adminUser = await upsertUser({
    username: env.seedAdminUsername,
    password: env.seedAdminPassword,
    displayName: 'System Admin',
    roles: ['department_admin','security_admin'],
    scopes: [{ dimension: 'global', value: '*' }],
    securityQuestionId: defaultQ._id,
    securityAnswer: 'rover',
  });
  const ops = await upsertUser({
    username: 'ops1', password: 'OpsPass!2026ABC',
    displayName: 'Ops Worker 1',
    roles: ['operations_staff'],
    scopes: [{ dimension: 'global', value: '*' }],
    securityQuestionId: defaultQ._id,
    securityAnswer: 'rover',
  });
  const student = await upsertUser({
    username: 'student1', password: 'StudentPass!2026',
    displayName: 'Student One',
    roles: ['student'],
    scopes: [{ dimension: 'school', value: 'SCH-1' }, { dimension: 'internship_cohort', value: 'COH-1' }],
    securityQuestionId: defaultQ._id,
    securityAnswer: 'rover',
  });
  await upsertUser({
    username: 'faculty1', password: 'FacultyPass!2026',
    displayName: 'Faculty Advisor 1',
    roles: ['faculty_advisor'],
    scopes: [{ dimension: 'school', value: 'SCH-1' }],
    securityQuestionId: defaultQ._id, securityAnswer: 'rover',
  });
  await upsertUser({
    username: 'mentor1', password: 'MentorPass!2026',
    displayName: 'Corporate Mentor 1',
    roles: ['corporate_mentor'],
    scopes: [{ dimension: 'internship_cohort', value: 'COH-1' }],
    securityQuestionId: defaultQ._id, securityAnswer: 'rover',
  });

  await upsertDemoContract();
  await upsertDemoShoe(student._id, ops._id);

  // Seed one exception for demo/reporting
  const exExists = await Exception.findOne({ summary: 'Demo missed check-in' });
  if (!exExists) {
    await Exception.create({
      exceptionType: 'missed_check_in', summary: 'Demo missed check-in',
      subjectUserId: student._id, status: 'open',
      scopes: [{ dimension: 'school', value: 'SCH-1' }, { dimension: 'internship_cohort', value: 'COH-1' }],
      openedBy: ops._id,
    });
  }
  console.log('[seed] complete');
  console.log(`[seed] admin username: ${env.seedAdminUsername} (must change password on first login)`);
  console.log('[seed] admin password: see .env SEED_ADMIN_PASSWORD — intentionally not logged.');
  await disconnect();
  process.exit(0);
}

main().catch(err => { console.error('[seed] fatal', err); process.exit(1); });
