import mongoose from 'mongoose';

const integrationSchema = new mongoose.Schema({
  provider: {
    type: String,
    required: [true, 'Provider name is required'],
    unique: true,
    trim: true,
  },
  accessToken: {
    type: String,
    default: '',
    select: false, // Never exposed in queries by default
    trim: true,
  },
  username: {
    type: String,
    default: '',
    trim: true,
  },
  displayName: {
    type: String,
    default: '',
    trim: true,
  },
  avatarUrl: {
    type: String,
    default: '',
    trim: true,
  },
  profileUrl: {
    type: String,
    default: '',
    trim: true,
  },
  scopes: {
    type: [String],
    default: ['repo', 'read:user'],
  },
  connectedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      ret.id = ret._id.toString();
      delete ret.accessToken; // Guarantee token is never serialized to JSON
      return ret;
    },
  },
});

export const Integration = mongoose.models.Integration || mongoose.model('Integration', integrationSchema);
export default Integration;

