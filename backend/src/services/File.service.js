const File = require("../model/File.model");
const Sharing = require("../model/Sharing.model");
const mongoose = require("mongoose");
const {
  getExtensionFromMimeType,
} = require("../utils/EquivalentMimeTypes.util");

const fs = require("fs");
const AES = require("../crypto/AES");
const SHA256 = require("../crypto/sha256");
const User = require("../model/User.model");
const { Encryption_and_Decryption } = require("../crypto/RSA");

const fetchDisplayFiles = async (userId) => {
  try {
    const encryptedFiles = await File.find({
      $and: [{ owner: userId }, { encryptedKey: { $nin: [null, ""] } }],
    })
      .sort({ createdAt: -1 })
      .limit(4)
      .select("_id filename fileType filePath createdAt");

    const unencryptedFiles = await File.find({
      $and: [{ owner: userId }, { encryptedKey: { $in: [null, ""] } }],
    })
      .sort({ createdAt: -1 })
      .limit(4)
      .select("_id filename fileType filePath createdAt");

    encryptedFiles.forEach((file) => {
      file.fileType = getExtensionFromMimeType(file.fileType);
    });

    unencryptedFiles.forEach((file) => {
      file.fileType = getExtensionFromMimeType(file.fileType);
    });

    return {
      success: true,
      data: { encryptedFiles, unencryptedFiles },
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "An error occurred while fetching files",
    };
  }
};

/**
 *
 * @param {*} file
 * @param {*} encrypted
 * @param {Object} loggedInUser
 * @returns
 */
const uploadFile = async (file, encrypted, loggedInUser) => {
  try {
    const path = `./uploads/${loggedInUser.username}`;

    if (!fs.existsSync(path)) {
      fs.mkdirSync(path, { recursive: true });
    }

    const fileData = new File({
      filename: `${file.name}`,
      fileType: file.mimetype,
      filePath: path,
      encryptedKey: "",
      iv: "",
      owner: loggedInUser.userId,
      hash: new SHA256().hash(file.data),
    });

    if (encrypted === "true") {
      const aes = new AES();
      const cipheredFileData = aes.AES_Encrypt(file.data.toString("hex"));
      const encryptedDataBuffer = Buffer.from(cipheredFileData, "hex");

      if (!cipheredFileData) {
        return null;
      }

      const rsa = new Encryption_and_Decryption();
      const public_key = fs.readFileSync(
        `C:/SecretKeys/${loggedInUser.username}/public_key.pem`,
        "utf8"
      );

      fileData.encryptedKey = rsa.encryptAESKey(aes.key, public_key);
      fileData.iv = aes.iv;
      fileData.filename = `${file.name}.aes`;
      saveEncryptedFile(path, fileData.filename, encryptedDataBuffer);
      await fileData.save();
      return { fileData, cipheredFileData };
    }

    saveNormalFile(path, fileData.filename, file.data);
    await fileData.save();
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "An error occurred while uploading the file",
    };
  }
};

/**
 *
 * @param {*} path
 * @param {*} filename
 * @param {*} cipheredFileData
 */
function saveEncryptedFile(path, filename, cipheredFileData) {
  fs.writeFile(`${path}/${filename}`, cipheredFileData, "binary", (err) => {
    if (err) throw err;
  });
}

// Saves files without encryption
function saveNormalFile(path, filename, fileData) {
  fs.writeFile(`${path}/${filename}`, fileData, "binary", (err) => {
    if (err) throw err;
  });
}

/**
 *
 * @param {*} fileId
 * @param {*} loggedInUser
 * @returns
 */
// Download a file
const downloadFile = async (fileId, loggedInUser) => {
  try {
    const file = await File.findById(fileId);

    if (!file) {
      return {
        success: false,
        message: "File not found",
      };
    } else {
      console.log("File found");
    }

    if (
      file.owner.toString() !== loggedInUser.userId.toString() &&
      !Sharing.findOne({ sharedWith: loggedInUser.userId })
    ) {
      console.log("Unauthorized access");
      return { success: false, message: "Unauthorized access" };
    }

    const encryptedFileData = fs.readFileSync(
      `${file.filePath}/${file.filename}`
    );

    const encryptedHexData = encryptedFileData.toString("hex");

    const aes = new AES();
    const rsa = new Encryption_and_Decryption();
    const private_key = fs.readFileSync(
      `C:/SecretKeys/${loggedInUser.username}/private_key.pem`,
      "utf8"
    );

    const decryptedHexData = aes.AES_Decrypt(
      rsa.decryptAESKey(file.encryptedKey, private_key),
      file.iv,
      encryptedHexData
    );

    const decryptedDataBuffer = Buffer.from(decryptedHexData, "hex");

    return {
      data: decryptedDataBuffer,
      fileName: file.filename, // Original file name or whatever you want to return
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "An error occurred while downloading the file",
    };
  }
};

const downloadNormalFile = async (fileId, userId) => {
  try {
    const file = await File.findById(fileId);

    if (!file) {
      return {
        success: false,
        message: "File not found",
      };
    }

    if (
      file.owner.toString() !== userId.toString() &&
      !Sharing.findOne({ sharedWith: userId })
    ) {
      return {
        success: false,
        message: "Unauthorized access",
      };
    }

    const fileData = fs.readFileSync(`${file.filePath}/${file.filename}`);

    return {
      data: fileData,
      fileName: file.filename,
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "An error occurred while downloading the file",
    };
  }
};

// Get all files by user
const getFilesByUser = async (userId) => {
  try {
    const files = await File.find({ owner: userId }).select(
      "_id filename fileType filePath createdAt"
    );

    files.forEach((file) => {
      file.fileType = getExtensionFromMimeType(file.fileType);
    });

    return files;
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "An error occurred while fetching files",
    };
  }
};

// Update share file list
const updateShareList = async (fileId, emails, userId) => {
  try {
    const file = await File.findById(fileId);

    if (!file) {
      return {
        success: false,
        message: "File not found",
      };
    }

    let sharingRecord = await Sharing.findOne({
      file: file._id,
    });

    const userPromises = emails.map(async (email) => {
      const user = await User.findOne({ email });
      if (!user) {
        return {
          success: false,
          message: `User with email ${email} not found`,
        };
      }
      return user._id;
    });

    const users = await Promise.all(userPromises);

    const notFound = users.filter((user) => !user);
    if (notFound.length > 0) {
      return {
        success: false,
        message: `Some users were not found: ${notFound.join(", ")}`,
      };
    }

    if (sharingRecord) {
      sharingRecord.sharedWith = users;
      await sharingRecord.save();

      return {
        success: true,
        message: "File shared successfully",
      };
    } else {
      // If no existing share record, create a new one
      sharingRecord = new Sharing({
        file: file._id,
        sharedWIth: users,
        sharedBy: userId,
      });
      await sharingRecord.save();
      return {
        success: true,
        message: "File shared successfully",
      };
    }
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "An error occurred while sharing the file",
    };
  }
};

const getSharedFiles = async (userId) => {
  try {
    const sharingRecords = await Sharing.find({
      sharedWith: userId,
    }).populate([
      {
        path: "file", // Populate the 'file' field with file details
        model: "File",
        select: "_id filename fileType createdAt", // Select only the required fields
      },
      {
        path: "sharedBy", // Populate the 'sharedBy' field with user details
        model: "User",
        select: "email fullname", // Select only the required fields (you can add more if needed)
      },
    ]);

    const sharedFiles = sharingRecords.reduce((acc, record) => {
      const sharedByUserEmail = record.sharedBy.email; // Get the email of the user who shared the file
      const sharedByUserFullname = record.sharedBy.fullname; // Get the fullname of the user who shared the file

      // If the user doesn't exist in the accumulator, create an entry for them
      if (!acc[sharedByUserEmail]) {
        acc[sharedByUserEmail] = {
          fullname: sharedByUserFullname,
          files: [],
        };
      }

      // Push the file into the user's files array (formatted properly)
      acc[sharedByUserEmail].files.push({
        _id: record.file._id.toString(),
        filename: record.file.filename,
        fileType: getExtensionFromMimeType(record.file.fileType),
        createdAt: record.file.createdAt.toISOString(),
      });

      return acc;
    }, {});

    return {
      success: true,
      data: sharedFiles,
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "An error occurred while fetching shared files",
    };
  }
};

module.exports = {
  fetchDisplayFiles,
  uploadFile,
  downloadFile,
  downloadNormalFile,
  getFilesByUser,
  updateShareList,
  getSharedFiles,
};
