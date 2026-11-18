import { parseAbi, type Address } from 'viem'
import { arcTestnet } from 'viem/chains'
import { getUsdc } from '@/onchain-facts'

export const CHAIN_ID = arcTestnet.id

// ERC-8004 and ERC-8183 reference deployments on Arc Testnet (agent-standards registry).
export const IDENTITY_REGISTRY: Address = '0x8004A818BFB912233c491871b3d84c89A494BD9e'
export const REPUTATION_REGISTRY: Address = '0x8004B663056A597Dffe9eCcC1965A193B7388713'
export const VALIDATION_REGISTRY: Address = '0x8004Cb1BF31DAf7788923b405b754f57acEB4272'
export const AGENTIC_COMMERCE: Address = '0x0747EEf0706327138c69792bF28Cd525089e4583'

// CycuxioOffice: roster, task lineage and outcome-based reputation bridge (deployed by this project).
export const OFFICE_CONFIGURED = Boolean(import.meta.env.VITE_CYCUXIO_OFFICE)
export const OFFICE_ADDRESS = (import.meta.env.VITE_CYCUXIO_OFFICE ?? '0x0000000000000000000000000000000000000000') as Address

export const USDC_ADDRESS: Address = (() => {
  const usdc = getUsdc(CHAIN_ID)
  if (!usdc) throw new Error('USDC is not registered for Arc Testnet')
  return usdc.address as Address
})()

export const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000'
export const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000' as const

export const identityAbi = parseAbi([
  'function register(string agentURI) returns (uint256 agentId)',
  'function setAgentURI(uint256 agentId, string newURI)',
  'function ownerOf(uint256 agentId) view returns (address)',
  'function tokenURI(uint256 agentId) view returns (string)',
  'function getAgentWallet(uint256 agentId) view returns (address)',
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
])

export const reputationAbi = parseAbi([
  'function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)',
])

export const validationAbi = parseAbi([
  'function validationRequest(address validatorAddress, uint256 agentId, string requestURI, bytes32 requestHash)',
  'function validationResponse(bytes32 requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag)',
  'function getValidationStatus(bytes32 requestHash) view returns (address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, string tag, uint256 lastUpdate)',
  'function getAgentValidations(uint256 agentId) view returns (bytes32[] requestHashes)',
  'function getValidatorRequests(address validatorAddress) view returns (bytes32[] requestHashes)',
])

export const commerceAbi = parseAbi([
  'struct Job { uint256 id; address client; address provider; address evaluator; string description; uint256 budget; uint256 expiredAt; uint8 status; address hook; }',
  'function createJob(address provider, address evaluator, uint256 expiredAt, string description, address hook) returns (uint256 jobId)',
  'function setBudget(uint256 jobId, uint256 amount, bytes optParams)',
  'function fund(uint256 jobId, bytes optParams)',
  'function submit(uint256 jobId, bytes32 deliverable, bytes optParams)',
  'function complete(uint256 jobId, bytes32 reason, bytes optParams)',
  'function reject(uint256 jobId, bytes32 reason, bytes optParams)',
  'function claimRefund(uint256 jobId)',
  'function getJob(uint256 jobId) view returns (Job)',
  'event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)',
])

export const officeAbi = parseAbi([
  'struct Listing { string role; uint96 priceUsdc; bool active; bool exists; }',
  'struct Task { uint256 jobId; uint256 agentId; address client; uint256 parentTaskId; bool rated; bool accepted; address provider; }',
  'function enlist(uint256 agentId, string role, uint96 priceUsdc)',
  'function updateListing(uint256 agentId, string role, uint96 priceUsdc, bool active)',
  'function recordTask(uint256 jobId, uint256 agentId, uint256 parentTaskId) returns (uint256 taskId)',
  'function acceptTask(uint256 taskId)',
  'function rateTask(uint256 taskId)',
  'function agentCount() view returns (uint256)',
  'function getAgentIds() view returns (uint256[])',
  'function getListing(uint256 agentId) view returns (Listing)',
  'function taskCount() view returns (uint256)',
  'function getTask(uint256 taskId) view returns (Task)',
  'function getTasks(uint256 offset, uint256 limit) view returns (Task[])',
  'function taskIdOfJob(uint256 jobId) view returns (uint256)',
  'event TaskRecorded(uint256 indexed taskId, uint256 indexed jobId, uint256 indexed agentId, address client, uint256 parentTaskId)',
])

export const JOB_STATUS = ['Open', 'Funded', 'Submitted', 'Completed', 'Rejected', 'Expired'] as const
export type JobStatus = (typeof JOB_STATUS)[number]

export const ROLES = ['Research', 'Analysis', 'Execution', 'Validator'] as const

/** Names an agent as a human-readable label even when its registration file is missing. */
export const agentLabel = (id: bigint) => `Agent #${id.toString()}`
