import { Schema, model, InferSchemaType } from 'mongoose';

const countsSchema = { total: Number, pending: Number, paid: Number };

// One document per report period, written by the order report job.
const analyticsSchema = new Schema(
  {
    reportType: { type: String, required: true },
    // The period the report covers: [periodStart, periodEnd).
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    tz: { type: String, required: true },
    // Orders created in the period, by their current status.
    orders: countsSchema,
    amount: countsSchema,
    // Reminder jobs that failed all their tries during the period.
    failedReminders: { type: Number, required: true },
    trigger: { type: String, enum: ['schedule', 'manual'], required: true },
    generatedAt: { type: Date, required: true },
  },
  { collection: 'analytics' },
);

// One report per type and period. The job saves with an upsert on this key, so
// a retry or a second run overwrites the report instead of adding a duplicate.
analyticsSchema.index({ reportType: 1, periodEnd: 1 }, { unique: true });

export type Analytics = InferSchemaType<typeof analyticsSchema>;
export const AnalyticsModel = model('Analytics', analyticsSchema);
