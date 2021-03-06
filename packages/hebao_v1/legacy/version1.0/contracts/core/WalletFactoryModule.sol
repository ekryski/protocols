// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6.10;
pragma experimental ABIEncoderV2;

import "../../base/WalletFactory.sol";

import "../../iface/Wallet.sol";

import "../../lib/AddressUtil.sol";

import "../ControllerImpl.sol";

import "./MetaTxModule.sol";


/// @title WalletFactoryModule
/// @dev Factory to create new wallets and also register a ENS subdomain for
///      newly created wallets.
///
/// @author Daniel Wang - <daniel@loopring.org>
///
/// The design of this contract is inspired by Argent's contract codebase:
/// https://github.com/argentlabs/argent-contracts
contract WalletFactoryModule is WalletFactory, MetaTxModule
{
    using AddressUtil for address;

    address public walletImplementation;

    constructor(
        ControllerImpl _controller,
        address      _walletImplementation
        )
        public
        MetaTxModule(_controller)
    {
        walletImplementation = _walletImplementation;
    }

    /// @dev Create a new wallet by deploying a proxy.
    /// @param _owner The wallet's owner.
    /// @param _label The ENS subdomain to register, use "" to skip.
    /// @param _labelApproval The signature for ENS subdomain approval.
    /// @param _modules The wallet's modules.
    /// @return _wallet The newly created wallet's address.
    function createWallet(
        address            _owner,
        string    calldata _label,
        bytes     calldata _labelApproval,
        address[] calldata _modules
        )
        external
        payable
        nonReentrant
        onlyFromMetaTxOrOwner(_owner)
        returns (address _wallet)
    {
        _wallet = createWalletInternal(
            controller,
            walletImplementation,
            _owner,
            address(this)
        );
        Wallet w = Wallet(_wallet);

        for(uint i = 0; i < _modules.length; i++) {
            w.addModule(_modules[i]);
        }

        if (bytes(_label).length > 0) {
            controller.ensManager().register(
                _wallet,
                _label,
                _labelApproval
            );
        }
        // Don't remove this module so it is still authorized for reimbursing meta tx's
        //w.removeModule(address(this));
    }

    function verifySigners(
        address   wallet,
        bytes4    method,
        bytes     memory data,
        address[] memory signers
        )
        internal
        view
        override
        returns (bool)
    {
        if (method == this.createWallet.selector) {
            // The wallet doesn't exist yet, so the owner of the wallet (or any guardians) has not yet been set.
            // Only allow the future wallet owner to sign the meta tx if the wallet hasn't been created yet.
            address futureOwner = extractAddressFromCallData(data, 0);
            return isOnlySigner(futureOwner, signers) && !wallet.isContract();
        } else {
            revert("INVALID_METHOD");
        }
    }

    function extractWalletAddress(bytes memory data)
        internal
        view
        override
        returns (address wallet)
    {
        require(extractMethod(data) == this.createWallet.selector, "INVALID_METHOD");
        address owner = extractAddressFromCallData(data, 0);
        wallet = computeWalletAddress(owner);
    }
}
