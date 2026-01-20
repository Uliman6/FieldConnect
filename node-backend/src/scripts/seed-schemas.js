/**
 * Seed default document schemas for Punch List and RFI
 * Run with: node src/scripts/seed-schemas.js
 */

const prisma = require('../services/prisma');

const defaultSchemas = [
  {
    name: 'Punch List',
    description: 'Standard punch list item for tracking deficiencies and incomplete work',
    documentType: 'PUNCH_LIST',
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'multiline', required: true },
      { name: 'assigned_to', label: 'Assigned To', type: 'company', required: false },
      { name: 'created_by', label: 'Created By', type: 'person', required: false },
      { name: 'location', label: 'Location', type: 'location', required: false },
      { name: 'created_on', label: 'Date of Creation', type: 'date', required: false },
      { name: 'root_cause', label: 'Root Cause', type: 'text', required: false },
      { name: 'attachments', label: 'Attachments', type: 'attachment', required: false },
    ],
    confidence: 1.0,
    sourceFileName: 'Manual Entry - ACC Standard Fields',
  },
  {
    name: 'RFI',
    description: 'Request for Information for clarifying design or construction questions',
    documentType: 'RFI',
    fields: [
      { name: 'subject', label: 'Subject', type: 'text', required: true },
      { name: 'created_on', label: 'Created On', type: 'date', required: false },
      { name: 'created_by', label: 'Created By', type: 'person', required: false },
      { name: 'ball_in_court', label: 'Ball in Court', type: 'person', required: false },
      { name: 'reference', label: 'Reference', type: 'text', required: false },
      { name: 'question', label: 'Question', type: 'multiline', required: true },
      { name: 'cost_impact', label: 'Cost Impact', type: 'text', required: false },
      { name: 'schedule_impact', label: 'Schedule Impact', type: 'text', required: false },
      { name: 'attachments', label: 'Attachments', type: 'attachment', required: false },
    ],
    confidence: 1.0,
    sourceFileName: 'Manual Entry - ACC Standard Fields',
  },
];

async function seedSchemas() {
  console.log('Seeding default document schemas...\n');

  for (const schema of defaultSchemas) {
    // Check if schema already exists
    const existing = await prisma.documentSchema.findFirst({
      where: {
        name: schema.name,
        documentType: schema.documentType,
        projectId: null, // Global/default schema
        isActive: true,
      },
    });

    if (existing) {
      console.log(`[SKIP] ${schema.name} already exists (ID: ${existing.id})`);
      continue;
    }

    // Create the schema
    const created = await prisma.documentSchema.create({
      data: {
        name: schema.name,
        description: schema.description,
        documentType: schema.documentType,
        fields: schema.fields,
        confidence: schema.confidence,
        sourceFileName: schema.sourceFileName,
        projectId: null, // Global schema
        isActive: true,
      },
    });

    console.log(`[CREATED] ${schema.name} (ID: ${created.id})`);
    console.log(`  - ${schema.fields.length} fields`);
    console.log(`  - Type: ${schema.documentType}\n`);
  }

  console.log('Done!');
}

seedSchemas()
  .catch((error) => {
    console.error('Error seeding schemas:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
