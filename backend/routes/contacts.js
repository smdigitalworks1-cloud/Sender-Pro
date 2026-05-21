const express = require('express');
const protect = require('../middleware/auth');
const { Contact } = require('../models');
const router = express.Router();

// GET all
router.get('/', protect, async (req, res) => {
  const { group, search } = req.query;
  const query = { userId: req.user._id };
  if (group) query.group = group;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];
  }
  const contacts = await Contact.find(query)
    .sort({ createdAt: -1 });
  res.json(contacts);
});

// GET groups list
router.get('/groups', protect, async (req, res) => {
  try {
    const groups = await Contact.distinct('group', { userId: req.user._id });
    res.json(groups);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST add one
router.post('/', protect, async (req, res) => {
  try {
    const { name, phone, group, tags } = req.body;
    const contact = await Contact.create({ userId: req.user._id, name, phone, group, tags });
    res.status(201).json(contact);
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ message: 'Contact already exists' });
    res.status(500).json({ message: e.message });
  }
});

// POST bulk import
router.post('/bulk', protect, async (req, res) => {
  const { contacts, group } = req.body;
  const docs = contacts.map(c => ({
    ...c,
    group: c.group || group || 'Import',
    userId: req.user._id,
    source: 'import',
  }));
  try {
    // Mongoose insertMany with ordered: false mimics ignoreDuplicates to some extent
    const result = await Contact.insertMany(docs, { ordered: false });
    res.status(201).json({ imported: result.length });
  } catch (e) {
    // If some succeeded and some failed due to unique constraint, result might still have some data
    if (e.insertedDocs) {
        return res.status(201).json({ imported: e.insertedDocs.length });
    }
    res.status(500).json({ message: e.message });
  }
});

// PUT update
router.put('/:id', protect, async (req, res) => {
  try {
    const contact = await Contact.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      req.body,
      { new: true }
    );
    if (!contact) return res.status(404).json({ message: 'Not found' });
    res.json(contact);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// DELETE one
router.delete('/:id', protect, async (req, res) => {
  try {
    await Contact.deleteOne({ _id: req.params.id, userId: req.user._id });
    res.json({ message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// DELETE many
router.delete('/', protect, async (req, res) => {
  try {
    const { ids } = req.body;
    await Contact.deleteMany({ _id: { $in: ids }, userId: req.user._id });
    res.json({ message: `Deleted ${ids.length}` });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST validate whatsapp status
router.post('/validate', protect, async (req, res) => {
  const { ids } = req.body;
  const client = req.app.get('getClientForUser')(req.user._id);
  if (!client) return res.status(400).json({ message: 'WhatsApp not connected' });

  const contacts = await Contact.find({ _id: { $in: ids }, userId: req.user._id });
  const results = { valid: 0, invalid: 0 };

  for (const contact of contacts) {
    try {
      const isRegistered = await client.isRegisteredUser(`${contact.phone}@c.us`);
      contact.isWhatsApp = isRegistered;
      contact.lastValidated = new Date();
      await contact.save();
      if (isRegistered) results.valid++;
      else results.invalid++;
    } catch (e) {
      console.error(`Error validating ${contact.phone}:`, e.message);
    }
  }

  res.json({ message: 'Validation complete', ...results });
});

module.exports = router;
