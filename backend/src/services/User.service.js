const User = require("../model/User.model");
const crypto = require("crypto");

const emailService = require("./Email.service");

const createUser = async (user) => {
  try {
    const existingUser = await User.findOne({
      $or: [{ email: user.email }, { username: user.email.split("@")[0] }],
    }).select("email username");

    if (existingUser) {
      return {
        success: false,
        message: "User already exists",
      };
    }

    const generatedPassword = crypto.randomBytes(6).toString("base64");

    const newUser = new User({
      fullname: user.fullname,
      email: user.email,
      username: user.email.split("@")[0],
      password: crypto
        .createHash("sha256")
        .update(generatedPassword)
        .digest("hex"),
      role: user.role.toUpperCase(),
    });

    try {
      await emailService.sendEmail(
        user.email,
        "Welcome to Kavach",
        `Hi ${newUser.fullname}, Your account has been created successfully.
        <br/><br/>Your username is ${newUser.username}
        <br/><br/>Your password is ${generatedPassword}
        <br/><br/>Your role is ${newUser.role}. You can discuss more about the role and its responsibilities with your admin.
        <br/><br/>Please login to your account and change your password.
        <br/><br/>Thanks, Kavach Team`
      );
    } catch (error) {
      console.error(error);
      return {
        success: false,
        message: "Invalid Email. Please enter a valid email address",
      };
    }

    await newUser.save();

    return {
      success: true,
      message: "User created successfully",
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
    };
  }
};

const getUsers = async (currentUser) => {
  try {
    const users = await User.find({ _id: { $ne: currentUser } }).select(
      "fullname email role joined_at"
    );

    return {
      success: true,
      data: users,
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
    };
  }
};

const getUserDetails = async (userId) => {
  try {
    const user = await User.findById(userId).select("fullname username");

    return {
      success: true,
      data: user,
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
    };
  }
};

module.exports = { createUser, getUsers, getUserDetails };
