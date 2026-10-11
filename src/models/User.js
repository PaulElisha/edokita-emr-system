import { Schema, model } from "mongoose";
import bcrypt from "bcrypt";

const userSchema = new Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        toLowerCase: true
    },
    password: {
        type: String,
        required: true
    },
    admin: {
        type: Boolean,
        default: false
    },
    otp: {
        type: String
    },
    otpExpired: {
        type: Date
    },
    lastOtpRequest: {
        type: Date,
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    passwordResetToken: {
        type: String,
    },
    passwordResetExpires: {
        type: Date,
    },
    profile: {
        country: {
            type: String,
            required: true,
        },
        number: {
            type: Number,
            required: true
        },
        street: {
            type: String,
            required: true
        },
        bio: {
            type: String,
            required: true
        }
    }
}, {
    timestamps: true
});

userSchema.pre('save', async function (next) {
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        return next();
    } catch (error) {
        return next(error);
    }
});

userSchema.methods.comparePassword = async function (password) {
    return bcrypt.compare(password, this.password);
}

const User = model("User", userSchema);
export { User };