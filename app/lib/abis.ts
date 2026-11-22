export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

export const swapAbi = [
  {
    type: "function",
    name: "swap",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
] as const;

export const vaultAbi = [
  {
    type: "function",
    name: "currentRoot",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "nextLeafIndex",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint32" }],
  },
  {
    type: "function",
    name: "scope",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "isLiveNote",
    stateMutability: "view",
    inputs: [{ name: "commitment", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "isSpentNullifier",
    stateMutability: "view",
    inputs: [{ name: "nullifier", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "shield",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "proof",
        type: "tuple",
        components: [
          { name: "a", type: "uint256[2]" },
          { name: "b", type: "uint256[2][2]" },
          { name: "c", type: "uint256[2]" },
        ],
      },
      {
        name: "inputs",
        type: "tuple",
        components: [
          { name: "noteCommitment", type: "bytes32" },
          { name: "collateralId", type: "uint32" },
          { name: "amount", type: "uint256" },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "unshield",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "proof",
        type: "tuple",
        components: [
          { name: "a", type: "uint256[2]" },
          { name: "b", type: "uint256[2][2]" },
          { name: "c", type: "uint256[2]" },
        ],
      },
      {
        name: "inputs",
        type: "tuple",
        components: [
          { name: "merkleRoot", type: "bytes32" },
          { name: "noteNullifier", type: "bytes32" },
          { name: "collateralId", type: "uint32" },
          { name: "amount", type: "uint256" },
          { name: "recipient", type: "address" },
        ],
      },
    ],
    outputs: [],
  },
] as const;

export const engineAbi = [
  {
    type: "function",
    name: "scope",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "positions",
    stateMutability: "view",
    inputs: [{ name: "commitment", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "markets",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint32" }],
    outputs: [
      { name: "pythFeedId", type: "bytes32" },
      { name: "maxLeverage", type: "uint32" },
      { name: "maintenanceMarginBps", type: "uint32" },
      { name: "listed", type: "bool" },
      { name: "fundingFactorPerSecond", type: "uint256" },
      { name: "borrowFactorPerSecond", type: "uint256" },
      { name: "impactFactorBps", type: "uint256" },
      { name: "epochDuration", type: "uint256" },
      { name: "epochStart", type: "uint256" },
      { name: "longOi", type: "uint256" },
      { name: "shortOi", type: "uint256" },
      { name: "fundingIndexLong", type: "int256" },
      { name: "fundingIndexShort", type: "int256" },
    ],
  },
  {
    type: "function",
    name: "profitFeeBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint32" }],
  },
  {
    type: "function",
    name: "open",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "proof",
        type: "tuple",
        components: [
          { name: "a", type: "uint256[2]" },
          { name: "b", type: "uint256[2][2]" },
          { name: "c", type: "uint256[2]" },
        ],
      },
      {
        name: "inputs",
        type: "tuple",
        components: [
          { name: "merkleRoot", type: "bytes32" },
          { name: "noteNullifier", type: "bytes32" },
          { name: "positionCommitment", type: "bytes32" },
          { name: "changeNoteCommitment", type: "bytes32" },
          { name: "markPrice", type: "uint256" },
          { name: "openedAt", type: "uint256" },
          { name: "marketId", type: "uint32" },
          { name: "collateralId", type: "uint32" },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "close",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "proof",
        type: "tuple",
        components: [
          { name: "a", type: "uint256[2]" },
          { name: "b", type: "uint256[2][2]" },
          { name: "c", type: "uint256[2]" },
        ],
      },
      {
        name: "inputs",
        type: "tuple",
        components: [
          { name: "positionCommitment", type: "bytes32" },
          { name: "positionNullifier", type: "bytes32" },
          { name: "payoutNoteCommitment", type: "bytes32" },
          { name: "exitPrice", type: "uint256" },
          { name: "protocolFee", type: "uint256" },
          { name: "marketId", type: "uint32" },
          { name: "collateralId", type: "uint32" },
        ],
      },
    ],
    outputs: [],
  },
] as const;

export const oracleAbi = [
  {
    type: "function",
    name: "getPrice",
    stateMutability: "view",
    inputs: [{ name: "feedId", type: "bytes32" }],
    outputs: [
      { name: "price", type: "uint256" },
      { name: "publishTime", type: "uint256" },
    ],
  },
] as const;
