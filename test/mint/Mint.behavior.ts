import { splitSignature } from "@ethersproject/bytes";
import { utils } from "@violetprotocol/ethereum-access-token-helpers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { artifacts, ethers, waffle } from "hardhat";
import { Artifact } from "hardhat/types";

import {
  EATVerifierConnector,
  ERC721HooksLogic,
  ExtendLogic,
  Extendable,
  GetterLogic,
  SetTokenURILogic,
  SoulMintLogic,
  SoulPermissionLogic,
} from "../../src/types";
import { SoulTokenURILogic } from "../../src/types/contracts/extensions/tokenURI/SoulTokenURILogic";
import { getExtendedContractWithInterface } from "../utils/utils";

export function shouldBehaveLikeSoulMint(): void {
  let extendableAsMint: SoulMintLogic;
  let extendableAsGetter: GetterLogic;
  let extendableAsTokenURI: SoulTokenURILogic;

  beforeEach("setup", async function () {
    const extendableArtifact: Artifact = await artifacts.readArtifact("Extendable");
    this.extendable = <Extendable>(
      await waffle.deployContract(this.signers.owner, extendableArtifact, [this.extend.address])
    );

    const erc721GetterArtifact: Artifact = await artifacts.readArtifact("GetterLogic");
    const erc721GetterLogic = <GetterLogic>await waffle.deployContract(this.signers.admin, erc721GetterArtifact, []);

    const erc721HooksArtifact: Artifact = await artifacts.readArtifact("ERC721HooksLogic");
    const erc721HooksLogic = <ERC721HooksLogic>await waffle.deployContract(this.signers.admin, erc721HooksArtifact, []);

    const tokenURILogicArtifact: Artifact = await artifacts.readArtifact("SoulTokenURILogic");
    const tokenURILogic = <SoulTokenURILogic>await waffle.deployContract(this.signers.admin, tokenURILogicArtifact, []);

    const permissionArtifact: Artifact = await artifacts.readArtifact("SoulPermissionLogic");
    this.permissioning = <SoulPermissionLogic>await waffle.deployContract(this.signers.admin, permissionArtifact, []);

    const extend = <ExtendLogic>await getExtendedContractWithInterface(this.extendable.address, "ExtendLogic");
    await extend.connect(this.signers.owner).extend(this.permissioning.address);

    const permission = <SoulPermissionLogic>(
      await getExtendedContractWithInterface(this.extendable.address, "SoulPermissionLogic")
    );
    await permission.connect(this.signers.owner).updateOperator(this.signers.operator.address);

    await extend.connect(this.signers.operator).extend(this.verifierExtension.address);
    await extend.connect(this.signers.operator).extend(this.mintLogic.address);
    await extend.connect(this.signers.operator).extend(erc721GetterLogic.address);
    await extend.connect(this.signers.operator).extend(erc721HooksLogic.address);
    await extend.connect(this.signers.operator).extend(tokenURILogic.address);

    const extendableAsVerifierExtension = <EATVerifierConnector>(
      await getExtendedContractWithInterface(this.extendable.address, "EATVerifierConnector")
    );
    await extendableAsVerifierExtension.connect(this.signers.operator).setVerifier(this.verifier.address);

    extendableAsMint = <SoulMintLogic>await getExtendedContractWithInterface(this.extendable.address, "SoulMintLogic");
    extendableAsGetter = <GetterLogic>await getExtendedContractWithInterface(this.extendable.address, "GetterLogic");
    extendableAsTokenURI = <SoulTokenURILogic>(
      await getExtendedContractWithInterface(this.extendable.address, "SoulTokenURILogic")
    );
  });

  describe("Mint", async () => {
    const tokenId = 42;
    const baseURI = "violet.co/";
    const tokenURI = "soul/";

    context("with EAT", async () => {
      context("from correct signer", async function () {
        context("with baseURI", async function () {
          beforeEach("set base URI", async function () {
            await extendableAsTokenURI.connect(this.signers.operator).setBaseURI(baseURI);
            expect(await extendableAsTokenURI.callStatic.baseURI()).to.equal(baseURI);
          });

          describe("with tokenURI", async () => {
            const completeTokenURI = `${tokenURI}${tokenId.toString()}`;

            beforeEach("construct ethereum access token", async function () {
              this.params = [this.signers.user0.address, tokenId];
              this.value = {
                expiry: BigNumber.from(Math.floor(new Date().getTime() / 1000) + 200),
                functionCall: {
                  functionSignature: extendableAsMint.interface.getSighash("mint"),
                  target: extendableAsMint.address.toLowerCase(),
                  caller: this.signers.user0.address.toLowerCase(),
                  parameters: utils.packParameters(extendableAsMint.interface, "mint", [
                    this.signers.user0.address.toLowerCase(),
                    tokenId,
                    completeTokenURI,
                  ]),
                },
              };
              this.signature = splitSignature(await utils.signAccessToken(this.signers.admin, this.domain, this.value));
            });

            it("should successfully mint to user", async function () {
              await expect(
                extendableAsMint
                  .connect(this.signers.user0)
                  .mint(
                    this.signature.v,
                    this.signature.r,
                    this.signature.s,
                    this.value.expiry,
                    this.signers.user0.address,
                    tokenId,
                    completeTokenURI,
                  ),
              )
                .to.emit(extendableAsMint, "Transfer")
                .withArgs(ethers.constants.AddressZero, this.signers.user0.address, tokenId);

              expect(await extendableAsGetter.callStatic.ownerOf(tokenId)).to.equal(this.signers.user0.address);
              expect(await extendableAsTokenURI.callStatic.tokenURI(tokenId)).to.equal(`${completeTokenURI}`);
            });

            it("with already minted token should fail", async function () {
              await expect(
                extendableAsMint
                  .connect(this.signers.user0)
                  .mint(
                    this.signature.v,
                    this.signature.r,
                    this.signature.s,
                    this.value.expiry,
                    this.signers.user0.address,
                    tokenId,
                    completeTokenURI,
                  ),
              ).to.not.be.reverted;

              await expect(
                extendableAsMint
                  .connect(this.signers.user0)
                  .mint(
                    this.signature.v,
                    this.signature.r,
                    this.signature.s,
                    this.value.expiry,
                    this.signers.user0.address,
                    tokenId,
                    completeTokenURI,
                  ),
              ).to.be.revertedWith("ERC721: token already minted");

              expect(await extendableAsGetter.callStatic.ownerOf(tokenId)).to.equal(this.signers.user0.address);
              expect(await extendableAsGetter.callStatic.balanceOf(this.signers.user0.address)).to.equal(1);
            });
          });

          describe("without tokenURI", async () => {
            beforeEach("construct ethereum access token", async function () {
              this.params = [this.signers.user0.address, tokenId];
              this.value = {
                expiry: BigNumber.from(Math.floor(new Date().getTime() / 1000) + 200),
                functionCall: {
                  functionSignature: extendableAsMint.interface.getSighash("mint"),
                  target: extendableAsMint.address.toLowerCase(),
                  caller: this.signers.user0.address.toLowerCase(),
                  parameters: utils.packParameters(extendableAsMint.interface, "mint", [
                    this.signers.user0.address.toLowerCase(),
                    tokenId,
                    "",
                  ]),
                },
              };
              this.signature = splitSignature(await utils.signAccessToken(this.signers.admin, this.domain, this.value));
            });

            it("should successfully mint to user", async function () {
              await expect(
                extendableAsMint
                  .connect(this.signers.user0)
                  .mint(
                    this.signature.v,
                    this.signature.r,
                    this.signature.s,
                    this.value.expiry,
                    this.signers.user0.address,
                    tokenId,
                    "",
                  ),
              )
                .to.emit(extendableAsMint, "Transfer")
                .withArgs(ethers.constants.AddressZero, this.signers.user0.address, tokenId);

              expect(await extendableAsGetter.callStatic.ownerOf(tokenId)).to.equal(this.signers.user0.address);
              expect(await extendableAsTokenURI.callStatic.tokenURI(tokenId)).to.equal(`${baseURI}`);
            });

            it("with already minted token should fail", async function () {
              await expect(
                extendableAsMint
                  .connect(this.signers.user0)
                  .mint(
                    this.signature.v,
                    this.signature.r,
                    this.signature.s,
                    this.value.expiry,
                    this.signers.user0.address,
                    tokenId,
                    "",
                  ),
              ).to.not.be.reverted;

              await expect(
                extendableAsMint
                  .connect(this.signers.user0)
                  .mint(
                    this.signature.v,
                    this.signature.r,
                    this.signature.s,
                    this.value.expiry,
                    this.signers.user0.address,
                    tokenId,
                    "",
                  ),
              ).to.be.revertedWith("ERC721: token already minted");

              expect(await extendableAsGetter.callStatic.ownerOf(tokenId)).to.equal(this.signers.user0.address);
            });
          });
        });

        context("without baseURI", async function () {
          const completeTokenURI = `${tokenURI}${tokenId.toString()}`;

          describe("with tokenURI", async () => {
            beforeEach("construct ethereum access token", async function () {
              this.params = [this.signers.user0.address, tokenId];
              this.value = {
                expiry: BigNumber.from(Math.floor(new Date().getTime() / 1000) + 2000),
                functionCall: {
                  functionSignature: extendableAsMint.interface.getSighash("mint"),
                  target: extendableAsMint.address.toLowerCase(),
                  caller: this.signers.user0.address.toLowerCase(),
                  parameters: utils.packParameters(extendableAsMint.interface, "mint", [
                    this.signers.user0.address.toLowerCase(),
                    tokenId,
                    completeTokenURI,
                  ]),
                },
              };
              this.signature = splitSignature(await utils.signAccessToken(this.signers.admin, this.domain, this.value));
            });

            it("should successfully mint to user", async function () {
              await expect(
                extendableAsMint
                  .connect(this.signers.user0)
                  .mint(
                    this.signature.v,
                    this.signature.r,
                    this.signature.s,
                    this.value.expiry,
                    this.signers.user0.address,
                    tokenId,
                    completeTokenURI,
                  ),
              )
                .to.emit(extendableAsMint, "Transfer")
                .withArgs(ethers.constants.AddressZero, this.signers.user0.address, tokenId);

              expect(await extendableAsGetter.callStatic.ownerOf(tokenId)).to.equal(this.signers.user0.address);
              expect(await extendableAsTokenURI.callStatic.tokenURI(tokenId)).to.equal(completeTokenURI);
            });

            it("with already minted token should fail", async function () {
              await expect(
                extendableAsMint
                  .connect(this.signers.user0)
                  .mint(
                    this.signature.v,
                    this.signature.r,
                    this.signature.s,
                    this.value.expiry,
                    this.signers.user0.address,
                    tokenId,
                    completeTokenURI,
                  ),
              ).to.not.be.reverted;

              await expect(
                extendableAsMint
                  .connect(this.signers.user0)
                  .mint(
                    this.signature.v,
                    this.signature.r,
                    this.signature.s,
                    this.value.expiry,
                    this.signers.user0.address,
                    tokenId,
                    completeTokenURI,
                  ),
              ).to.be.revertedWith("ERC721: token already minted");

              expect(await extendableAsGetter.callStatic.ownerOf(tokenId)).to.equal(this.signers.user0.address);
            });
          });

          describe("without tokenURI", async () => {
            beforeEach("construct ethereum access token", async function () {
              this.params = [this.signers.user0.address, tokenId];
              this.value = {
                expiry: BigNumber.from(Math.floor(new Date().getTime() / 1000) + 50000),
                functionCall: {
                  functionSignature: extendableAsMint.interface.getSighash("mint"),
                  target: extendableAsMint.address.toLowerCase(),
                  caller: this.signers.user0.address.toLowerCase(),
                  parameters: utils.packParameters(extendableAsMint.interface, "mint", [
                    this.signers.user0.address.toLowerCase(),
                    tokenId,
                    "",
                  ]),
                },
              };

              this.signature = splitSignature(await utils.signAccessToken(this.signers.admin, this.domain, this.value));
            });

            it("should successfully mint to user", async function () {
              await expect(
                extendableAsMint
                  .connect(this.signers.user0)
                  .mint(
                    this.signature.v,
                    this.signature.r,
                    this.signature.s,
                    this.value.expiry,
                    this.signers.user0.address,
                    tokenId,
                    "",
                  ),
              )
                .to.emit(extendableAsMint, "Transfer")
                .withArgs(ethers.constants.AddressZero, this.signers.user0.address, tokenId);

              expect(await extendableAsGetter.callStatic.ownerOf(tokenId)).to.equal(this.signers.user0.address);
              expect(await extendableAsTokenURI.callStatic.tokenURI(tokenId)).to.equal("");
            });

            it("with already minted token should fail", async function () {
              await expect(
                extendableAsMint
                  .connect(this.signers.user0)
                  .mint(
                    this.signature.v,
                    this.signature.r,
                    this.signature.s,
                    this.value.expiry,
                    this.signers.user0.address,
                    tokenId,
                    "",
                  ),
              ).to.not.be.reverted;

              await expect(
                extendableAsMint
                  .connect(this.signers.user0)
                  .mint(
                    this.signature.v,
                    this.signature.r,
                    this.signature.s,
                    this.value.expiry,
                    this.signers.user0.address,
                    tokenId,
                    "",
                  ),
              ).to.be.revertedWith("ERC721: token already minted");

              expect(await extendableAsGetter.callStatic.ownerOf(tokenId)).to.equal(this.signers.user0.address);
            });
          });
        });
      });

      context("from incorrect signer", async function () {
        beforeEach("construct ethereum access token", async function () {
          this.params = [this.signers.user0.address, tokenId];
          this.value = {
            expiry: BigNumber.from(Math.floor(new Date().getTime() / 1000) + 50000),
            functionCall: {
              functionSignature: extendableAsMint.interface.getSighash("mint"),
              target: extendableAsMint.address.toLowerCase(),
              caller: this.signers.user0.address.toLowerCase(),
              parameters: utils.packParameters(extendableAsMint.interface, "mint", [
                this.signers.user0.address.toLowerCase(),
                tokenId,
                "",
              ]),
            },
          };
          this.signature = splitSignature(await utils.signAccessToken(this.signers.user1, this.domain, this.value));
        });

        it("should fail to mint", async function () {
          await expect(
            extendableAsMint
              .connect(this.signers.user0)
              .mint(
                this.signature.v,
                this.signature.r,
                this.signature.s,
                this.value.expiry,
                this.signers.user0.address,
                tokenId,
                "",
              ),
          ).to.be.revertedWith("AccessToken: verification failure");

          await expect(extendableAsGetter.ownerOf(tokenId)).to.be.revertedWith(
            "ERC721: owner query for nonexistent token",
          );
        });
      });

      context("with incorrect tokenURI", async function () {
        beforeEach("construct ethereum access token", async function () {
          this.params = [this.signers.user0.address, tokenId];
          this.value = {
            expiry: BigNumber.from(Math.floor(new Date().getTime() / 1000) + 50000),
            functionCall: {
              functionSignature: extendableAsMint.interface.getSighash("mint"),
              target: extendableAsMint.address.toLowerCase(),
              caller: this.signers.user0.address.toLowerCase(),
              parameters: utils.packParameters(extendableAsMint.interface, "mint", [
                this.signers.user0.address.toLowerCase(),
                tokenId,
                tokenURI,
              ]),
            },
          };
          this.signature = splitSignature(await utils.signAccessToken(this.signers.user1, this.domain, this.value));
        });

        it("should fail to mint", async function () {
          await expect(
            extendableAsMint
              .connect(this.signers.user0)
              .mint(
                this.signature.v,
                this.signature.r,
                this.signature.s,
                this.value.expiry,
                this.signers.user0.address,
                tokenId,
                "baduri",
              ),
          ).to.be.revertedWith("AccessToken: verification failure");

          await expect(extendableAsGetter.ownerOf(tokenId)).to.be.revertedWith(
            "ERC721: owner query for nonexistent token",
          );
        });
      });

      context("from incorrect user", async function () {
        beforeEach("construct ethereum access token", async function () {
          this.params = [this.signers.user0.address, tokenId];
          this.value = {
            expiry: BigNumber.from(Math.floor(new Date().getTime() / 1000) + 50000),
            functionCall: {
              functionSignature: extendableAsMint.interface.getSighash("mint"),
              target: extendableAsMint.address.toLowerCase(),
              caller: this.signers.user0.address.toLowerCase(),
              parameters: utils.packParameters(extendableAsMint.interface, "mint", [
                this.signers.user0.address.toLowerCase(),
                tokenId,
                tokenURI,
              ]),
            },
          };
          this.signature = splitSignature(await utils.signAccessToken(this.signers.user1, this.domain, this.value));
        });

        it("should fail to mint", async function () {
          await expect(
            extendableAsMint
              .connect(this.signers.user1)
              .mint(
                this.signature.v,
                this.signature.r,
                this.signature.s,
                this.value.expiry,
                this.signers.user0.address,
                tokenId,
                tokenURI,
              ),
          ).to.be.revertedWith("AccessToken: verification failure");

          await expect(extendableAsGetter.ownerOf(tokenId)).to.be.revertedWith(
            "ERC721: owner query for nonexistent token",
          );
        });
      });

      context("to incorrect recipient", async function () {
        beforeEach("construct ethereum access token", async function () {
          this.params = [this.signers.user0.address, tokenId];
          this.value = {
            expiry: BigNumber.from(Math.floor(new Date().getTime() / 1000) + 50000),
            functionCall: {
              functionSignature: extendableAsMint.interface.getSighash("mint"),
              target: extendableAsMint.address.toLowerCase(),
              caller: this.signers.user0.address.toLowerCase(),
              parameters: utils.packParameters(extendableAsMint.interface, "mint", [
                this.signers.user0.address.toLowerCase(),
                tokenId,
                tokenURI,
              ]),
            },
          };
          this.signature = splitSignature(await utils.signAccessToken(this.signers.user1, this.domain, this.value));
        });

        it("should fail to mint", async function () {
          await expect(
            extendableAsMint
              .connect(this.signers.user0)
              .mint(
                this.signature.v,
                this.signature.r,
                this.signature.s,
                this.value.expiry,
                this.signers.user1.address,
                tokenId,
                tokenURI,
              ),
          ).to.be.revertedWith("AccessToken: verification failure");

          await expect(extendableAsGetter.ownerOf(tokenId)).to.be.revertedWith(
            "ERC721: owner query for nonexistent token",
          );
        });
      });

      context("with expired EAT", async function () {
        beforeEach("construct ethereum access token", async function () {
          this.params = [this.signers.user0.address, tokenId];
          this.value = {
            expiry: BigNumber.from(Math.floor(new Date().getTime() / 1000) - 10),
            functionCall: {
              functionSignature: extendableAsMint.interface.getSighash("mint"),
              target: extendableAsMint.address.toLowerCase(),
              caller: this.signers.user0.address.toLowerCase(),
              parameters: utils.packParameters(extendableAsMint.interface, "mint", [
                this.signers.user0.address.toLowerCase(),
                tokenId,
                tokenURI,
              ]),
            },
          };
          this.signature = splitSignature(await utils.signAccessToken(this.signers.user1, this.domain, this.value));
        });

        it("should fail to mint", async function () {
          await expect(
            extendableAsMint
              .connect(this.signers.user1)
              .mint(
                this.signature.v,
                this.signature.r,
                this.signature.s,
                this.value.expiry,
                this.signers.user0.address,
                tokenId,
                tokenURI,
              ),
          ).to.be.revertedWith("AccessToken: has expired");

          await expect(extendableAsGetter.ownerOf(tokenId)).to.be.revertedWith(
            "ERC721: owner query for nonexistent token",
          );
        });
      });
    });
  });
}
