// SPDX-License-Identifier: MIT
pragma solidity >=0.8.13;

import "@violetprotocol/extendable/extensions/permissioning/PermissioningLogic.sol";

interface ISoulPermissionLogic {
    /**
     * @dev Emitted when `operator` is updated in any way
     */
    event OperatorUpdated(address oldOperator, address newOperator);

    /**
     * @notice Updates the `owner` to `newOwner`
     */
    function updateOperator(address newOperator) external;

    /**
     * @notice Returns the current `owner`
     */
    function getOperator() external returns (address);
}

abstract contract SoulPermissionExtension is ISoulPermissionLogic, PermissioningLogic {
    /**
     * @dev see {IExtension-getSolidityInterface}
     */
    function getSolidityInterface() public pure virtual override returns (string memory) {
        return
            string(
                abi.encodePacked(
                    super.getSolidityInterface(),
                    "function updateOperator(address newOperator) external;\n"
                    "function getOperator() external returns(address);\n"
                )
            );
    }

    /**
     * @dev see {IExtension-getInterface}
     */
    function getInterface() public virtual override returns (Interface[] memory interfaces) {
        interfaces = new Interface[](2);

        bytes4[] memory functions = new bytes4[](2);
        functions[0] = ISoulPermissionLogic.updateOperator.selector;
        functions[0] = ISoulPermissionLogic.getOperator.selector;

        interfaces[0] = super.getInterface()[0];
        interfaces[1] = Interface(type(ISoulPermissionLogic).interfaceId, functions);
    }
}
