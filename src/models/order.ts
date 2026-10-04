import { Schema, model, InferSchemaType } from 'mongoose';

const orderSchema = new Schema(
  {
    item: { type: String, required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'paid'], default: 'pending' },
    // Id of the delayed BullMQ reminder job, so we can cancel it on payment.
    reminderJobId: { type: String, default: null },
  },
  { timestamps: true },
);

export type Order = InferSchemaType<typeof orderSchema>;
export const OrderModel = model('Order', orderSchema);
