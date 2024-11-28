const { sbox, invSbox } = require("./SBox.js");
const { mul2, mul3, mul9, mul11, mul13, mul14 } = require("./LookupTables.js");
const crypto = require("crypto");
const sha256 = require("./sha256.js");

class AES {
  constructor() {
    this.key = this.#generateKey();
    this.iv = crypto.randomBytes(16).toString("hex");
  }
  /**
   * * The function generates AES key based on the system timestamp.
   * * The timestamp is then hashed with SHA and converted to hexadecimal format and returned.
   *
   * @returns 256bit (32 bytes) long AES key in hex format.
   */
  #generateKey() {
    const date = new Date().toString(32);
    // const aesKey = crypto.createHash("sha256").update(date).digest("hex");
    const aesKey = new sha256().hash(date);

    return aesKey;
  }

  /**
   * * This method rotates the provided array by mentioned shift position.
   *
   * @param {*} array Accepts every row of the 4x4 matrix.
   * @param {*} shiftPos Indicates the number of positions to be shifted.
   * @returns the shifted array.
   */
  #rotateRight(array, shiftPos) {
    let length = array.length;
    shiftPos = shiftPos % length;

    return array.slice(shiftPos).concat(array.slice(0, shiftPos));
  }

  /**
   * * This method is used in the keyExpansion method.
   * * It rotates the word by 1 position / 1 Byte.
   *
   * @param {*} word  A hex value usually 8 digits for aes-256.
   * @returns  The rotated word.
   */
  #rotword(word) {
    return word.slice(2) + word.slice(0, 2);
  }

  /**
   *
   * * This method is used in the keyExpansion method.
   * * It substitutes the hex values of the word using the sbox.
   * * The result is then converted to hex
   *
   * @param {*} word  A hex value usually 8 digits for aes-256.
   * @returns The substituted word.
   */
  #subWord(word) {
    let groupedHexValues = [];
    for (let i = 0; i < word.length; i += 2) {
      groupedHexValues.push(word.slice(i, i + 2));
    }

    const subworded = groupedHexValues
      .map((byte) => sbox[parseInt(byte, 16)].toString(16).padStart(2, "0"))
      .join("");

    return subworded;
  }

  /**
   * * XOR operation on two hex values.
   * * This method is used in the keyExpansion method.
   * * The XOR operation is done on each byte of the two hex values.
   * * The result is then converted to hex and returned.
   *
   * * For aes-256, value1 is the result of the previous word operations and value2 is w[i-8].
   *
   * @param {*} value1 A hex value usually 8 digits for aes-256.
   * @param {*} value2 another hex value usually 8 digits for aes-256.
   * @returns XOR of the above two values.
   */
  #XOR(value1, value2) {
    let result = "";
    for (let j = 0; j < value1.length; j += 2) {
      let byteFromResult = parseInt(value1.slice(j, j + 2), 16);
      let byteFromW = parseInt(value2.slice(j, j + 2), 16);

      result += (byteFromResult ^ byteFromW).toString(16).padStart(2, "0");
    }
    return result;
  }

  /**
   * ? Key Expansion in AES-256:
   *
   * * Key Length: 256 bits (32 bytes).
   * * Number of Rounds: 14.
   * * Nk = 8
   * * Total Expanded Key Words: 60
   *
   * * The first 8 words are directly taken from the key.
   * * New words are generated using a combination of the previous words,
   * * the RotWord, SubWord, and XOR with Rcon operations and its result with w[i-Nk] to get w[i].
   *
   * * The expanded key words are used in the AddRoundKey step for each of the 14 rounds of AES-256.
   *
   * @param {*} key The key is the initial key generated by the system for symmetric encryption in AES.
   * @returns This method returns the expanded key.
   */
  #keyExpansion(key) {
    /**
     * rcon = Round Constant
     * Contains round constants to be used for each round.
     * Each constant is XORed only with the first byte of the word, and only when (i % Nk == 0).
     * Nk = 8 for AES-256.
     */
    const rcon = [
      "0x01", //1
      "0x02", //2
      "0x04", //4
      "0x08", //8
      "0x10", //16
      "0x20", //32
      "0x40", //64
    ];

    const w = new Array(60);

    for (let i = 0; i < 8; i++) {
      w[i] = key.slice(i * 8, i * 8 + 8);
    }

    for (let i = 8; i < 60; i++) {
      let temp = w[i - 1];

      if (i % 8 === 0) {
        temp = this.#subWord(this.#rotword(temp));

        const wordFirstValuePair = parseInt(temp.slice(0, 2), 16);
        const rconDecimalEquiv = parseInt(rcon[i / 8 - 1], 16);

        temp =
          (wordFirstValuePair ^ rconDecimalEquiv)
            .toString(16)
            .padStart(2, "0") + temp.slice(2);

        temp = this.#XOR(temp, w[i - 8]);
      } else if (i % 8 === 4) {
        temp = this.#subWord(temp);
        temp = this.#XOR(temp, w[i - 8]);
      } else {
        temp = this.#XOR(temp, w[i - 8]);
      }

      w[i] = temp;
    }

    return w;
  }

  /**
   *
   * @param {*} string
   * @returns
   */
  #stringToHex(string) {
    return string
      .split("")
      .map((char) => char.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   *
   * @param {*} hex
   * @returns string equivalent of the hex
   */
  #hexToString(hex) {
    return hex
      .match(/.{2}/g)
      .map((byte) => String.fromCharCode(parseInt(byte, 16)))
      .join("");
  }

  /**
   *
   * @param {*} hexStr
   * @returns
   */
  #padTo16Bytes(hexStr) {
    // PKCS#7 Padding
    const blockSize = 16; // 16 bytes (128 bits)
    const hexBytesLength = hexStr.length / 2;
    const paddingLength = blockSize - (hexBytesLength % blockSize);

    const paddingHex = paddingLength.toString(16).padStart(2, "0");
    return hexStr + paddingHex.repeat(paddingLength);
  }

  /**
   *
   * @param {*} state
   * @param {*} expandedKey
   * @param {*} round
   */
  #addRoundKey(state, expandedKey, round) {
    const roundKey = expandedKey.slice(round * 4, (round + 1) * 4);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        state[row][col] = this.#XOR(
          state[row][col],
          roundKey[col].slice(2 * row, 2 * row + 2)
        );
      }
    }
  }

  /**
   *
   * @param {*} state
   */
  #substituteBytes(state) {
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        // Convert the hex value in state to decimal, then substitute using S-box
        const byte = parseInt(state[row][col], 16);
        state[row][col] = sbox[byte].toString(16).padStart(2, "0"); // Ensure 2-digit hex value
      }
    }
  }

  /**
   * * This  is similar to the `substituteBytes`  in encryption
   * * but uses the inverse S-box to reverse the substitution.
   *
   * @param {*} state The current state of the matrix during decryption.
   */
  #inverseSubstituteBytes(state) {
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const byte = parseInt(state[row][col], 16);
        state[row][col] = invSbox[byte].toString(16).padStart(2, "0");
      }
    }
  }

  /**
   * ? Shift Row stage
   * * This stage is repeated in every round (upto N)
   * * In this, circular shiting happens in every row of the 4x4 matrix.
   * * First row is shifted by 0, second by 1, third by 2 and fourth by 3 position.
   *
   * @param {*} state The parameter `state` is the current state of the matrix. Its value changes in every round.
   */
  #shiftRows(state) {
    let shiftBy = 0;

    state.forEach((row) => {
      state[shiftBy] = this.#rotateRight(row, shiftBy);
      shiftBy++;
    });
  }

  /**
   * * This function reverses the ShiftRows step by shifting the rows back to their original positions.
   *
   * @param {*} state The current state of the matrix during decryption.
   */
  #inverseShiftRows(state) {
    let shiftBy = 0;

    state.forEach((row) => {
      state[shiftBy] = this.#rotateRight(row, 4 - shiftBy);
      shiftBy++;
    });
  }

  /**
   * * Diffusion layer of AES.
   * * A common `MIX_COLUMN_MATRIX` is used to ensure all the blocks have common diffusion.
   *
   * @param {*} state
   */
  #mixColumns(state) {
    for (let col = 0; col < 4; col++) {
      let s0 = parseInt(state[0][col], 16);
      let s1 = parseInt(state[1][col], 16);
      let s2 = parseInt(state[2][col], 16);
      let s3 = parseInt(state[3][col], 16);

      // Perform the matrix multiplication with the MixColumns constant matrix
      let t0 = mul2[s0] ^ mul3[s1] ^ s2 ^ s3;
      let t1 = s0 ^ mul2[s1] ^ mul3[s2] ^ s3;
      let t2 = s0 ^ s1 ^ mul2[s2] ^ mul3[s3];
      let t3 = mul3[s0] ^ s1 ^ s2 ^ mul2[s3];

      // Update the state with the new values
      state[0][col] = t0.toString(16).padStart(2, "0");
      state[1][col] = t1.toString(16).padStart(2, "0");
      state[2][col] = t2.toString(16).padStart(2, "0");
      state[3][col] = t3.toString(16).padStart(2, "0");
    }
  }

  /**
   * * This function reverses the MixColumns transformation using inverse MixColumns logic.
   * * AES decryption has a specific inverse MixColumn operation.
   *
   * @param {*} state The current state of the matrix during decryption.
   */
  #inverseMixColumns(state) {
    for (let col = 0; col < 4; col++) {
      let s0 = parseInt(state[0][col], 16);
      let s1 = parseInt(state[1][col], 16);
      let s2 = parseInt(state[2][col], 16);
      let s3 = parseInt(state[3][col], 16);

      // Perform the matrix multiplication with the MixColumns constant matrix
      let t0 = mul14[s0] ^ mul11[s1] ^ mul13[s2] ^ mul9[s3];
      let t1 = mul9[s0] ^ mul14[s1] ^ mul11[s2] ^ mul13[s3];
      let t2 = mul13[s0] ^ mul9[s1] ^ mul14[s2] ^ mul11[s3];
      let t3 = mul11[s0] ^ mul13[s1] ^ mul9[s2] ^ mul14[s3];

      // Update the state with the new values
      state[0][col] = t0.toString(16).padStart(2, "0");
      state[1][col] = t1.toString(16).padStart(2, "0");
      state[2][col] = t2.toString(16).padStart(2, "0");
      state[3][col] = t3.toString(16).padStart(2, "0");
    }
  }

  /**
   *
   * @param {*} state
   * @param {*} iv
   * @returns
   */
  #xorWithIV(state, iv) {
    // XOR with IV or previous cipher block
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        state[i][j] = (parseInt(iv[i][j], 16) ^ parseInt(state[i][j], 16))
          .toString(16)
          .padStart(2, "0");
      }
    }
    return state;
  }

  /**
   *
   * @param {*} hexString
   * @returns unpadded text (original cipher text)
   */
  #removePadding(hexString) {
    const bytes = [];
    for (let i = 0; i < hexString.length; i += 2) {
      bytes.push(parseInt(hexString.substr(i, 2), 16));
    }

    const paddingLength = bytes[bytes.length - 1];
    const unpaddedBytes = bytes.slice(0, bytes.length - paddingLength);

    // Convert back to hex string
    return unpaddedBytes
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * * This is the main encryption function. Each operation of AES happens from here.
   * * This method is responsible for encrypting the message and saving it to the file.
   *
   * @param {*} key
   * @param {*} iv
   * @param {*} message
   *
   * @returns This method returns the encrypted message of length 128-bit.
   */
  #encryptWithIV(key, iv, message) {
    /**
     * * The message is converted hex, padded and then to a 4x4 matrix.
     */
    // Converting message to hex.
    let state = this.#stringToHex(message);
    // Padding the message to 16 bytes.
    state = this.#padTo16Bytes(state);

    //converting iv to matrix
    let ivMatrix = [];
    for (let i = 0; i < 4; i++) {
      ivMatrix[i] = [];
      for (let j = 0; j < 4; j++) {
        const bytePosition = (j * 4 + i) * 2;
        ivMatrix[i][j] = iv
          .slice(bytePosition, bytePosition + 2)
          .padStart(2, "0");
      }
    }

    const blockCount = state.length / 32;
    let cipherText = "";

    // Process each block individually
    for (let blockIndex = 0; blockIndex < blockCount; blockIndex++) {
      // Extract a single block of the message
      let block = state.slice(blockIndex * 32, (blockIndex + 1) * 32);

      // Converting block to a 4x4 array (state matrix)
      let matrix = [];
      for (let i = 0; i < 4; i++) {
        matrix[i] = [];
        for (let j = 0; j < 4; j++) {
          const bytePosition = (j * 4 + i) * 2; // Column-major order
          matrix[i][j] = block
            .slice(bytePosition, bytePosition + 2)
            .padStart(2, "0");
        }
      }

      /**
       * Generating the expanded key.
       */
      const expanded_key = this.#keyExpansion(key);

      matrix = this.#xorWithIV(matrix, ivMatrix);

      /**
       * Add Round Key stage
       */
      this.#addRoundKey(matrix, expanded_key, 0);

      for (let round = 1; round <= 14; round++) {
        //Substitute Bytes
        this.#substituteBytes(matrix);
        //Shift Rows
        this.#shiftRows(matrix);
        //Mix Columns
        if (round !== 14) this.#mixColumns(matrix);
        //Add Round Key
        this.#addRoundKey(matrix, expanded_key, round);
      }

      // appending to the ciphertext
      cipherText += matrix.flat().join("");

      //updating iv with latest cipher matrix
      ivMatrix = matrix;
    }
    return cipherText;
  }

  /**
   *
   * @param {*} key
   * @param {*} iv
   * @param {*} message
   * @returns the decrypted message.
   */
  #decryptWithIV(key, iv, cipherMessage) {
    const blockCount = cipherMessage.length / 32;
    let plaintext = "";

    //converting iv to matrix
    let ivMatrix = [];
    for (let i = 0; i < 4; i++) {
      ivMatrix[i] = [];
      for (let j = 0; j < 4; j++) {
        const bytePosition = (j * 4 + i) * 2;
        ivMatrix[i][j] = iv
          .slice(bytePosition, bytePosition + 2)
          .padStart(2, "0");
      }
    }

    /**
     * Generating the expanded key.
     */
    const expanded_key = this.#keyExpansion(key);

    // Decrypt each block of ciphertext
    for (let blockIndex = 0; blockIndex < blockCount; blockIndex++) {
      // Extract a single block of the ciphertext
      const block = cipherMessage.slice(blockIndex * 32, (blockIndex + 1) * 32);

      // Convert the block to a 4x4 matrix
      let matrix = [];
      for (let row = 0; row < 4; row++) {
        matrix[row] = [];
        for (let cols = 0; cols < 4; cols++) {
          matrix[row][cols] = block.slice(
            (row * 4 + cols) * 2,
            (row * 4 + cols) * 2 + 2
          );
        }
      }

      /**
       * Add Round Key stage
       */
      this.#addRoundKey(matrix, expanded_key, 14);

      for (let round = 13; round >= 0; round--) {
        //Inverse Shift Rows
        this.#inverseShiftRows(matrix);
        //Inverse Substitute Bytes
        this.#inverseSubstituteBytes(matrix);
        //Add Round Key
        this.#addRoundKey(matrix, expanded_key, round);
        // Skip MixColumns for the final round
        if (round !== 0) this.#inverseMixColumns(matrix);
      }

      // XOR the decrypted block with the IV or previous ciphertext block
      matrix = this.#xorWithIV(matrix, ivMatrix);

      // Convert the state matrix back to a hex string (plaintext)
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          plaintext += matrix[j][i];
        }
      }

      // Update IV with the current ciphertext block for the next iteration
      for (let i = 0; i < 4; i++) {
        ivMatrix[i] = [];
        for (let j = 0; j < 4; j++) {
          ivMatrix[i][j] = block.slice((i * 4 + j) * 2, (i * 4 + j) * 2 + 2);
        }
      }
    }

    return this.#removePadding(plaintext);
  }

  /**
   * * Encrypts the message using AES encryption.
   * * The method generates a key and an IV for encryption.
   *
   * @param {*} message
   * @returns The encrypted message.
   */
  AES_Encrypt(message) {
    const ciphermsg = this.#encryptWithIV(this.key, this.iv, message);
    return ciphermsg;
  }

  /**
   * * Decrypts the message using AES decryption.
   * * The method uses the key and IV generated during encryption.
   *
   * @param {*} key
   * @param {*} iv
   * @param {*} encryptedMessage
   * @returns The decrypted message.
   */
  AES_Decrypt(key, iv, encryptedMessage) {
    const decipheredMessage = this.#decryptWithIV(key, iv, encryptedMessage);
    return this.#hexToString(decipheredMessage);
  }
}

module.exports = AES;
