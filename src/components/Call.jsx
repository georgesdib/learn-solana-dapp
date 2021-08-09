import React, { useState, useEffect } from "react";
import * as borsh from "borsh";
import { Alert, Button, Space, Col, Typography } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import {
  Connection,
  PublicKey,
  Keypair,
  TransactionInstruction,
  sendAndConfirmTransaction,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";

import {
  getNodeRpcURL,
  getAccountExplorerURL,
  getNodeWsURL,
  getTxExplorerURL,
} from "../lib/utils";

const { Text } = Typography;

// The state of a greeting account managed by the hello world program
class GreetingAccount {
  counter = 0;
  constructor(fields = undefined) {
    if (fields) {
      this.counter = fields.counter;
    }
  }
}

// Borsh schema definition for greeting accounts
const GreetingSchema = new Map([
  [GreetingAccount, { kind: "struct", fields: [["counter", "u32"]] }],
]);

// The expected size of each greeting account.
const GREETING_SIZE = borsh.serialize(
  GreetingSchema,
  new GreetingAccount()
).length;

const PAYER_SECRET_KEY = [
  9, 123, 160, 219, 165, 164, 20, 194, 106, 174, 250, 210, 86, 57, 132, 232, 50,
  237, 123, 62, 201, 212, 232, 194, 58, 86, 1, 31, 179, 66, 79, 121, 3, 161,
  209, 155, 9, 5, 96, 39, 35, 153, 100, 106, 153, 96, 251, 206, 115, 155, 71,
  22, 142, 51, 80, 229, 70, 144, 62, 21, 167, 128, 193, 157,
];
const PROGRAM_SECRET_KEY = [
  115, 159, 190, 155, 242, 107, 201, 79, 35, 151, 28, 112, 184, 230, 142, 17,
  159, 93, 117, 59, 235, 109, 215, 190, 159, 57, 250, 59, 156, 156, 79, 144,
  168, 181, 139, 46, 188, 190, 220, 133, 0, 228, 1, 123, 33, 175, 197, 178, 144,
  57, 249, 128, 127, 190, 101, 88, 68, 140, 242, 100, 141, 251, 206, 186,
];

const Program = () => {
  const [connection, setConnection] = useState(null);
  const [programId, setProgramId] = useState(null);
  const [greeterPublicKey, setGreeterPublicKey] = useState(null);
  const [greetingsCounter, setGreetingsCounter] = useState(null);
  const [greetFetching, setGreetFetching] = useState(false);
  const [greetTxSignature, setGreetTxSignature] = useState(null);

  useEffect(() => {
    establishConnection();
  }, []);

  const establishConnection = () => {
    const url = getNodeRpcURL();
    const connection = new Connection(url, { wsEndpoint: getNodeWsURL() });
    setConnection(connection);
  };

  const checkProgram = async () => {
    if (!PAYER_SECRET_KEY || !PROGRAM_SECRET_KEY) {
      alert("Set PAYER_SECRET_KEY and PROGRAM_SECRET_KEY first!");
    }

    const programSecretKey = new Uint8Array(PROGRAM_SECRET_KEY);
    const programKeypair = Keypair.fromSecretKey(programSecretKey);
    const programId = programKeypair.publicKey;
    setProgramId(programId);

    // // Check if the program has been deployed
    // await connection.getAccountInfo(programId);
    // console.log(`Using program ${programId.toBase58()}`);

    const payerSecretKey = new Uint8Array(PAYER_SECRET_KEY);
    const payerKeypair = Keypair.fromSecretKey(payerSecretKey);

    // Derive the address of a greeting account from the program so that it's easy to find later.
    const GREETING_SEED = "hello";
    const greetedPubkey = await PublicKey.createWithSeed(
      payerKeypair.publicKey,
      GREETING_SEED,
      programId
    );
    setGreeterPublicKey(greetedPubkey);

    // Check if the greeting account has already been created
    const greetedAccount = await connection.getAccountInfo(greetedPubkey);
    if (greetedAccount === null) {
      console.log(
        "Creating account",
        greetedPubkey.toBase58(),
        "to say hello to"
      );
      const lamports = await connection.getMinimumBalanceForRentExemption(
        GREETING_SIZE
      );

      const transaction = new Transaction().add(
        SystemProgram.createAccountWithSeed({
          fromPubkey: payerKeypair.publicKey,
          basePubkey: payerKeypair.publicKey,
          seed: GREETING_SEED,
          newAccountPubkey: greetedPubkey,
          lamports,
          space: GREETING_SIZE,
          programId,
        })
      );

      sendAndConfirmTransaction(connection, transaction, [payerKeypair])
        .then((res) => console.log(`res`, res))
        .catch((err) => console.log(`err`, err));
    }
  };

  const greet = async () => {
    // Load the payer's Keypair from the Uint8Array PAYER_SECRET_KEY
    // by using Keypair.fromsecretkey
    // https://solana-labs.github.io/solana-web3.js/classes/keypair.html#fromsecretkey
    const payerSecretKey = new Uint8Array(PAYER_SECRET_KEY);
    const payerKeypair = Keypair.fromSecretKey(payerSecretKey);

    // Create the TransactionInstruction by passing keys, programId and data
    // For data you can pass Buffer.alloc(0) as all the program's instructions are the same
    const inst = new TransactionInstruction({
      keys: [{ isSigner: false, isWritable: true, pubkey: greeterPublicKey }],
      programId,
      data: Buffer.alloc(0),
    });
    const transaction = new Transaction().add(inst);

    // Call sendAndConfirmTransaction
    setGreetFetching(true);
    sendAndConfirmTransaction(connection, transaction, [payerKeypair])
      .then((signature) => {
        // https://solana-labs.github.io/solana-web3.js/modules.html#sendandconfirmtransaction
        // On success, call getGreetings() to fetch the greetings counter
        console.log(`SUCCESS`, signature);
        setGreetTxSignature(signature);
        setGreetFetching(false);
        getGreetings();
      })
      .catch((error) => {
        console.error(`ERROR`, error);
        setGreetFetching(false);
      });
  };

  const getGreetings = async () => {
    const accountInfo = await connection.getAccountInfo(greeterPublicKey);

    if (accountInfo === null) throw "Error: cannot find the greeted account";

    const greeting = borsh.deserialize(
      GreetingSchema,
      GreetingAccount,
      accountInfo.data
    );

    setGreetingsCounter(greeting.counter);
  };

  if (!greeterPublicKey) {
    return (
      <Space>
        <Button type="primary" onClick={checkProgram}>
          Check Program Info
        </Button>
      </Space>
    );
  }

  return (
    <Col>
      <Space direction="vertical" size="large">
        <Space direction="horizontal" size="large">
          <Button type="default" onClick={checkProgram}>
            Check Program Info
          </Button>
          <Text strong>Program deployed!</Text>
          <a
            href={getAccountExplorerURL(programId.toString())}
            target="_blank"
            rel="noreferrer"
          >
            View program on Solana Explorer
          </a>
        </Space>
        <Button type="primary" onClick={greet}>
          Send a greeting to the program
        </Button>
        {greetFetching && (
          <Space size="large">
            <LoadingOutlined style={{ fontSize: 24, color: "#1890ff" }} spin />
            <Text italic={true} type="secondary">
              Transaction initiated. Waiting for confirmations...
            </Text>
          </Space>
        )}
        {greetTxSignature && !greetFetching && (
          <Alert
            message={
              <Space direction="horizontal">
                <Text strong>Transaction confirmed!</Text>
                <Text>{`Greetings Counter: ${greetingsCounter}`}</Text>
              </Space>
            }
            description={
              <a
                href={getTxExplorerURL(greetTxSignature)}
                target="_blank"
                rel="noreferrer"
              >
                View transaction on Solana Explorer
              </a>
            }
            type="success"
            showIcon
          />
        )}
      </Space>
    </Col>
  );
};

export default Program;
