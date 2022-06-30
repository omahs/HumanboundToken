// SPDX-License-Identifier: MIT
pragma solidity >=0.8.13;

import "@violetprotocol/erc721extendable/contracts/extensions/base/mint/MintLogic.sol";
import "@violetprotocol/erc721extendable/contracts/extensions/metadata/setTokenURI/PermissionedSetTokenURILogic.sol";
import "@violetprotocol/erc721extendable/contracts/extensions/metadata/getter/MetadataGetterLogic.sol";
import "../EAT/AccessTokenConsumerExtension.sol";

contract TokenURILogic is PermissionedSetTokenURILogic, MetadataGetterLogic {
    event BaseURISet(string newBaseURI);

    function setBaseURI(string memory baseURI) public override {
        super.setBaseURI(baseURI);
        emit BaseURISet(baseURI);
    }

    function getInterfaceId()
        public
        pure
        virtual
        override(BasicSetTokenURILogic, MetadataGetterLogic)
        returns (bytes4)
    {
        return (type(IBasicSetTokenURILogic).interfaceId ^ type(IMetadataGetterLogic).interfaceId);
    }

    function getInterface()
        public
        pure
        virtual
        override(BasicSetTokenURILogic, MetadataGetterLogic)
        returns (string memory)
    {
        return string(abi.encodePacked(BasicSetTokenURILogic.getInterface(), MetadataGetterLogic.getInterface()));
    }
}
