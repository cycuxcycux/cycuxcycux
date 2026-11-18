// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal interface to the existing ERC-8004 IdentityRegistry.
interface ICycuxioIdentityRegistry {
    /// @notice Returns the current owner of an agent identity.
    function ownerOf(uint256 agentId) external view returns (address);

    /// @notice Returns the wallet registered for an agent identity.
    function getAgentWallet(uint256 agentId) external view returns (address);
}

/// @notice Minimal interface to the existing ERC-8004 ReputationRegistry.
interface ICycuxioReputationRegistry {
    /// @notice Records feedback for an agent using the registry's authorization rules.
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external;
}

/// @notice Minimal interface to the existing ERC-8183 AgenticCommerce deployment.
interface ICycuxioAgenticCommerce {
    struct Job {
        uint256 id;
        address client;
        address provider;
        address evaluator;
        string description;
        uint256 budget;
        uint256 expiredAt;
        uint8 status;
        address hook;
    }

    /// @notice Returns a job; statuses are Open=0, Funded=1, Submitted=2,
    /// Completed=3, Rejected=4 and Expired=5.
    function getJob(uint256 jobId) external view returns (Job memory);
}

/**
 * @title CycuxioOffice
 * @notice Thin agent roster, task lineage ledger and outcome-based reputation bridge
 * for existing Arc Testnet ERC-8004 and ERC-8183 deployments. No custody or fees.
 * Negative ratings require prior task acceptance by the stored provider or current identity owner.
 * @dev The configured registries and commerce deployment are trusted. The evaluator
 * is trusted per ERC-8183; wash trading between an owner's own wallets is possible
 * and costs real escrow flow. This contract does not independently verify work.
 */
contract CycuxioOffice {
    struct Listing {
        string role;
        uint96 priceUsdc;
        bool active;
        bool exists;
    }

    struct Task {
        uint256 jobId;
        uint256 agentId;
        address client;
        uint256 parentTaskId;
        bool rated;
        bool accepted;
        address provider;
    }

    /// @notice Existing identity registry used for ownership and provider wallets.
    ICycuxioIdentityRegistry public immutable identity;
    /// @notice Existing reputation registry receiving outcome feedback.
    ICycuxioReputationRegistry public immutable reputation;
    /// @notice Existing commerce contract supplying jobs and final outcomes.
    ICycuxioAgenticCommerce public immutable commerce;

    uint8 private constant COMPLETED = 3;
    uint8 private constant REJECTED = 4;
    uint8 private constant EXPIRED = 5;

    uint256[] private _agentIds;
    mapping(uint256 => Listing) private _listings;
    mapping(uint256 => Task) private _tasks;
    mapping(uint256 => uint256) private _taskIdOfJob;
    uint256 private _taskCount;

    error ZeroAddress();
    error NotAgentOwner(uint256 agentId);
    error InvalidRoleLength();
    error AlreadyListed(uint256 agentId);
    error ListingNotFound(uint256 agentId);
    error InactiveListing(uint256 agentId);
    error AgentIndexOutOfBounds(uint256 index);
    error NotJobClient(uint256 jobId);
    error InvalidProvider(uint256 jobId);
    error JobAlreadyRecorded(uint256 jobId);
    error TaskNotFound(uint256 taskId);
    error InvalidParentClient(uint256 parentTaskId);
    error AlreadyRated(uint256 taskId);
    error UnauthorizedRater(uint256 taskId);
    error JobNotFinal(uint256 jobId, uint8 status);
    error SelfEvaluatedNegativeRating(uint256 jobId);
    error AlreadyAccepted(uint256 taskId);
    error NotAccepted(uint256 taskId);
    error ProviderChanged(uint256 taskId);
    error JobNotRecordable(uint256 jobId, uint8 status);
    error UnauthorizedAcceptor(uint256 taskId);
    error JobNotAcceptable(uint256 jobId, uint8 status);

    event AgentEnlisted(uint256 indexed agentId, address indexed owner, string role, uint96 priceUsdc);
    event AgentUpdated(uint256 indexed agentId, string role, uint96 priceUsdc, bool active);
    event TaskRecorded(
        uint256 indexed taskId,
        uint256 indexed jobId,
        uint256 indexed agentId,
        address client,
        uint256 parentTaskId
    );
    event TaskRated(uint256 indexed taskId, uint256 indexed agentId, uint8 score);
    event TaskAccepted(uint256 indexed taskId, uint256 indexed agentId, address by);

    /// @notice Configures the three existing deployments permanently; none may be zero.
    constructor(address identity_, address reputation_, address commerce_) {
        if (identity_ == address(0) || reputation_ == address(0) || commerce_ == address(0)) {
            revert ZeroAddress();
        }
        identity = ICycuxioIdentityRegistry(identity_);
        reputation = ICycuxioReputationRegistry(reputation_);
        commerce = ICycuxioAgenticCommerce(commerce_);
    }

    /// @notice Enlists an owned agent with a 1–32 byte role and suggested price.
    /// @param priceUsdc Suggested price in 6-decimal USDC atomic units, not an enforced budget.
    function enlist(uint256 agentId, string calldata role, uint96 priceUsdc) external {
        _requireAgentOwner(agentId);
        _validateRole(role);
        if (_listings[agentId].exists) revert AlreadyListed(agentId);

        _listings[agentId] = Listing(role, priceUsdc, true, true);
        _agentIds.push(agentId);
        emit AgentEnlisted(agentId, msg.sender, role, priceUsdc);
    }

    /// @notice Lets the current identity owner update an existing listing, including activation.
    /// @param priceUsdc Suggested price in 6-decimal USDC atomic units only.
    function updateListing(uint256 agentId, string calldata role, uint96 priceUsdc, bool active) external {
        _requireAgentOwner(agentId);
        _validateRole(role);
        if (!_listings[agentId].exists) revert ListingNotFound(agentId);

        _listings[agentId] = Listing(role, priceUsdc, active, true);
        emit AgentUpdated(agentId, role, priceUsdc, active);
    }

    /// @notice Returns the number of agents ever enlisted, including inactive listings.
    function agentCount() external view returns (uint256) {
        return _agentIds.length;
    }

    /// @notice Returns the agent ID at a zero-based roster index.
    function agentIdAt(uint256 i) external view returns (uint256) {
        if (i >= _agentIds.length) revert AgentIndexOutOfBounds(i);
        return _agentIds[i];
    }

    /// @notice Returns all enlisted agent IDs in insertion order.
    function getAgentIds() external view returns (uint256[] memory) {
        return _agentIds;
    }

    /// @notice Returns a listing; an unknown agent has exists=false and default fields.
    function getListing(uint256 agentId) external view returns (Listing memory) {
        return _listings[agentId];
    }

    /// @notice Records a client's unique open or funded commerce job for an active agent, with optional lineage.
    /// @dev Stores the provider for later attribution checks; recording does not accept the task.
    /// @param parentTaskId Zero for no parent, otherwise an existing task of the same client.
    /// @return taskId The newly assigned one-based task ID.
    function recordTask(uint256 jobId, uint256 agentId, uint256 parentTaskId)
        external
        returns (uint256 taskId)
    {
        Listing storage listing = _listings[agentId];
        if (!listing.exists) revert ListingNotFound(agentId);
        if (!listing.active) revert InactiveListing(agentId);
        if (_taskIdOfJob[jobId] != 0) revert JobAlreadyRecorded(jobId);

        ICycuxioAgenticCommerce.Job memory job = commerce.getJob(jobId);
        if (job.client != msg.sender) revert NotJobClient(jobId);
        if (job.status > 1) revert JobNotRecordable(jobId, job.status);
        if (job.provider == address(0) || job.provider != identity.getAgentWallet(agentId)) {
            revert InvalidProvider(jobId);
        }
        if (parentTaskId != 0) {
            _requireTask(parentTaskId);
            if (_tasks[parentTaskId].client != msg.sender) revert InvalidParentClient(parentTaskId);
        }

        taskId = ++_taskCount;
        _tasks[taskId] = Task(jobId, agentId, msg.sender, parentTaskId, false, false, job.provider);
        _taskIdOfJob[jobId] = taskId;
        emit TaskRecorded(taskId, jobId, agentId, msg.sender, parentTaskId);
    }

    /// @notice Accepts a task as its stored provider or current identity owner.
    /// @dev The provider must be unchanged and the job must be Open, Funded or Submitted.
    function acceptTask(uint256 taskId) external {
        _requireTask(taskId);
        Task storage task = _tasks[taskId];
        if (task.accepted) revert AlreadyAccepted(taskId);
        if (msg.sender != task.provider && msg.sender != identity.ownerOf(task.agentId)) {
            revert UnauthorizedAcceptor(taskId);
        }

        ICycuxioAgenticCommerce.Job memory job = commerce.getJob(task.jobId);
        if (job.provider != task.provider) revert ProviderChanged(taskId);
        if (job.status > 2) revert JobNotAcceptable(task.jobId, job.status);

        task.accepted = true;
        emit TaskAccepted(taskId, task.agentId, msg.sender);
    }

    /// @notice Returns the total number of recorded tasks.
    function taskCount() external view returns (uint256) {
        return _taskCount;
    }

    /// @notice Returns an existing one-based task; reverts for an unknown task.
    function getTask(uint256 taskId) external view returns (Task memory) {
        _requireTask(taskId);
        return _tasks[taskId];
    }

    /// @notice Returns the task ID for a commerce job, or zero if not recorded.
    function taskIdOfJob(uint256 jobId) external view returns (uint256) {
        return _taskIdOfJob[jobId];
    }

    /// @notice Returns tasks in insertion order using a zero-based offset and clamped limit.
    /// @dev Offset zero starts at task ID 1; offsets at or above taskCount return an empty array.
    function getTasks(uint256 offset, uint256 limit) external view returns (Task[] memory page) {
        uint256 count = _taskCount;
        if (offset >= count) return new Task[](0);
        uint256 size = count - offset;
        if (limit < size) size = limit;
        page = new Task[](size);
        for (uint256 i = 0; i < size; ++i) {
            page[i] = _tasks[offset + i + 1];
        }
    }

    /// @notice Submits one outcome-derived rating as this office: completed=100, rejected/expired=0.
    /// @dev Only the job's current client or evaluator may call; the provider must be unchanged.
    /// Negative feedback requires prior task acceptance and a distinct evaluator and client.
    /// Positive feedback does not require acceptance. Uses the listing's current role as the second tag.
    /// The rated flag is set before feedback and rolls back if the registry call reverts.
    function rateTask(uint256 taskId) external {
        _requireTask(taskId);
        Task storage task = _tasks[taskId];
        if (task.rated) revert AlreadyRated(taskId);

        ICycuxioAgenticCommerce.Job memory job = commerce.getJob(task.jobId);
        if (job.provider != task.provider) revert ProviderChanged(taskId);
        if (msg.sender != job.client && msg.sender != job.evaluator) {
            revert UnauthorizedRater(taskId);
        }
        if (job.status != COMPLETED && job.status != REJECTED && job.status != EXPIRED) {
            revert JobNotFinal(task.jobId, job.status);
        }
        uint8 score = job.status == COMPLETED ? 100 : 0;
        if (score == 0 && !task.accepted) revert NotAccepted(taskId);
        if (score == 0 && job.evaluator == job.client) {
            revert SelfEvaluatedNegativeRating(task.jobId);
        }

        task.rated = true;
        reputation.giveFeedback(
            task.agentId,
            int128(uint128(score)),
            0,
            "cycuxio-task",
            _listings[task.agentId].role,
            "",
            "",
            keccak256(abi.encodePacked("cycuxio:job:", task.jobId))
        );
        emit TaskRated(taskId, task.agentId, score);
    }

    function _requireAgentOwner(uint256 agentId) private view {
        if (identity.ownerOf(agentId) != msg.sender) revert NotAgentOwner(agentId);
    }

    function _validateRole(string calldata role) private pure {
        uint256 length = bytes(role).length;
        if (length == 0 || length > 32) revert InvalidRoleLength();
    }

    function _requireTask(uint256 taskId) private view {
        if (taskId == 0 || taskId > _taskCount) revert TaskNotFound(taskId);
    }
}
