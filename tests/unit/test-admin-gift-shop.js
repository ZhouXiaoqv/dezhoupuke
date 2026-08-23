const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-admin-test-'));
const dataDir = path.join(tmpDir, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const {
  UserStore,
  PREMIUM_CARD_BACK_IDS,
} = require(path.join(repoRoot, 'server', 'userStore'));
const {
  CatalogStore,
  PREMIUM_BLIND_BOX_ID,
} = require(path.join(repoRoot, 'server', 'catalogStore'));

function assertOk(value, message) {
  assert(!value.error, value.error || message);
}

const userStore = new UserStore({ dataFile: path.join(dataDir, 'users.json') });
const catalogStore = new CatalogStore({ dataFile: path.join(dataDir, 'catalog.json') });
userStore.setCatalogStore(catalogStore);
assert(!catalogStore.getAllCardBackIds().includes('dragonboat-2'));
const onePieceCardBackIds = [
  'onepiece-straw-hat',
  'onepiece-red-hair',
  'onepiece-heart',
  'onepiece-whitebeard',
  'onepiece-roger',
  'onepiece-blackbeard',
  'onepiece-beasts',
  'onepiece-zoro',
  'onepiece-nami',
  'onepiece-usopp',
  'onepiece-sanji',
  'onepiece-chopper',
  'onepiece-robin',
  'onepiece-franky',
  'onepiece-brook',
];
for (const id of onePieceCardBackIds) {
  const cardBack = catalogStore.getCardBack(id);
  assert.strictEqual(cardBack.type, 'image');
  assert(cardBack.imageUrl.startsWith('assets/cardbacks/onepiece/'));
  assert(cardBack.imageUrl.endsWith('.webp'));
  assert.strictEqual(catalogStore.getShopItem(id), null);
  assert(!catalogStore.getBlindBoxDropPool().some((item) => item.cardBackId === id));
}
const cuteCardBackIds = [
  'cute-strawberry-milk',
  'cute-cloud-bear',
  'cute-matcha-dango',
  'cute-lemon-soda',
  'cute-cherry-rabbit',
  'cute-mint-cat',
  'cute-honey-duck',
  'cute-peach-fox',
  'cute-blueberry-penguin',
];
for (const id of cuteCardBackIds) {
  const cardBack = catalogStore.getCardBack(id);
  assert.strictEqual(cardBack.type, 'image');
  assert(cardBack.imageUrl.startsWith('assets/cardbacks/cute/'));
  assert(cardBack.imageUrl.endsWith('.webp'));
  assert.strictEqual(catalogStore.getShopItem(id), null);
  assert(!catalogStore.getBlindBoxDropPool().some((item) => item.cardBackId === id));
}
const premiumCardBackIds = [...onePieceCardBackIds, ...cuteCardBackIds];
assert.deepStrictEqual(PREMIUM_CARD_BACK_IDS, premiumCardBackIds);
const publicCatalog = catalogStore.getPublicCatalog();
const premiumBlindBox = publicCatalog.blindBoxes.find((box) => box.id === PREMIUM_BLIND_BOX_ID);
assert(premiumBlindBox);
assert.strictEqual(premiumBlindBox.name, '精品主题盲盒');
assert.strictEqual(premiumBlindBox.price, 1000);
assert.strictEqual(premiumBlindBox.dropType, 'cardBackPool');
assert.deepStrictEqual(premiumBlindBox.cardBackIds, premiumCardBackIds);
assert(publicCatalog.shopItems.every((item) => !premiumCardBackIds.includes(item.cardBackId)));
assert.strictEqual(
  catalogStore.updateShopItem({ cardBackId: premiumCardBackIds[0], enabled: true }).error,
  '精品牌背仅可通过盲盒获得',
);

const legacyCatalogPath = path.join(dataDir, 'legacy-catalog.json');
fs.writeFileSync(legacyCatalogPath, JSON.stringify({
  cardBacks: [
    {
      id: premiumCardBackIds[0],
      name: '草帽海贼旗',
      type: 'image',
      imageUrl: 'assets/cardbacks/onepiece/straw-hat.png',
      order: 1,
    },
  ],
  shopItems: [
    {
      id: `cardback-${premiumCardBackIds[0]}`,
      type: 'cardBack',
      cardBackId: premiumCardBackIds[0],
      categoryId: 'card-backs',
      price: 800,
      enabled: true,
      order: 1,
    },
  ],
}, null, 2));
const migratedCatalogStore = new CatalogStore({ dataFile: legacyCatalogPath });
assert.strictEqual(migratedCatalogStore.getShopItem(premiumCardBackIds[0]), null);
assert.strictEqual(
  migratedCatalogStore.getCardBack(premiumCardBackIds[0]).imageUrl,
  'assets/cardbacks/onepiece/straw-hat.webp',
);
const petBlindBoxCatalogItem = catalogStore
  .getPublicCatalog()
  .blindBoxes.find((box) => box.id === 'pet-blindbox');
assert.strictEqual(petBlindBoxCatalogItem.categoryId, 'blind-box');
const movedPetBlindBox = catalogStore.updateBlindBox({
  id: 'pet-blindbox',
  categoryId: 'pets',
});
assertOk(movedPetBlindBox, 'update pet blindbox category');
assert.strictEqual(movedPetBlindBox.blindBox.categoryId, 'blind-box');

console.log('\n=== Admin/Gift/Shop Unit Test ===');

const adminLogin = userStore.login('admin', 'adminjujku');
assertOk(adminLogin, 'admin login');
assert.strictEqual(adminLogin.profile.role, 'admin');
assert.strictEqual(userStore.applyDailyCheckIn('admin'), null, 'admin does not check in');

const alice = userStore.register('alice', 'test123');
assertOk(alice, 'alice register');
assert.strictEqual(alice.profile.role, 'player');
assert.deepStrictEqual(alice.profile.claimedHolidayGiftIds, []);

const disable = userStore.disableUser('alice', 'admin');
assertOk(disable, 'disable alice');
assert.strictEqual(userStore.login('alice', 'test123').error, 'Account disabled');
assert.strictEqual(userStore.validateToken(alice.token), null);
assert(userStore.disableUser('admin', 'admin').error, 'cannot delete admin');

const bob = userStore.register('bob', 'test123');
assertOk(bob, 'bob register');
assert.deepStrictEqual(bob.profile.ownedPets, []);
assert.strictEqual(bob.profile.equippedPet, '');
const bobUser = userStore.users.get('bob');
bobUser.coins = 1000;
userStore._save();

const start = new Date(Date.now() - 60_000).toISOString();
const end = new Date(Date.now() + 60_000).toISOString();
const gift = catalogStore.createHolidayGift({
  name: '测试礼物',
  startsAt: start,
  endsAt: end,
  rewards: [
    { type: 'coins', amount: 300 },
    { type: 'emotion', id: 'rose', amount: 2 },
    { type: 'cardBack', id: 'dragonboat-1' },
  ],
});
assertOk(gift, 'create gift');
let profile = userStore.getProfile('bob');
assert.strictEqual(catalogStore.getClaimableHolidayGifts(profile).length, 1);
const claim = userStore.applyHolidayGift('bob', gift.gift);
assertOk(claim, 'claim gift');
assert.strictEqual(claim.profile.coins, 1300);
assert.strictEqual(claim.profile.emotionInventory.rose, 2);
assert(claim.profile.ownedCardBacks.includes('dragonboat-1'));
assert.strictEqual(userStore.applyHolidayGift('bob', gift.gift).error, 'Gift already claimed');
assert.strictEqual(catalogStore.getClaimableHolidayGifts(claim.profile).length, 0);

const duplicateGift = {
  id: 'duplicate',
  name: '重复牌背',
  rewards: [{ type: 'cardBack', id: 'dragonboat-1' }],
};
const duplicateClaim = userStore.applyHolidayGift('bob', duplicateGift);
assertOk(duplicateClaim, 'duplicate cardback gift claim');
assert.strictEqual(duplicateClaim.rewards.length, 1);
assert.strictEqual(duplicateClaim.rewards[0].duplicate, true);
assert.strictEqual(duplicateClaim.skipped.length, 1);
assert.strictEqual(
  duplicateClaim.profile.ownedCardBacks.filter((id) => id === 'dragonboat-1').length,
  1,
);

const blind = userStore.buyBlindBox('bob', 'cardback-blindbox', () => 0);
assertOk(blind, 'blindbox buy');
assert.strictEqual(blind.price, 300);
assert.strictEqual(blind.rewardType, undefined);
assert(blind.cardBackId);
assert(blind.profile.ownedCardBacks.includes(blind.cardBackId));

const retainedPremiumId = premiumCardBackIds[0];
bobUser.ownedCardBacks.push(retainedPremiumId);
userStore._save();
assert(userStore.getProfile('bob').ownedCardBacks.includes(retainedPremiumId));
assert.strictEqual(userStore.buyCardBack('bob', retainedPremiumId).error, 'Card back not found');
const firstPremiumPool = catalogStore.getCardBackBlindBoxDropPool(
  premiumBlindBox,
  userStore.getProfile('bob').ownedCardBacks,
);
assert.strictEqual(firstPremiumPool.length, premiumCardBackIds.length - 1);
assert(!firstPremiumPool.some((item) => item.cardBackId === retainedPremiumId));
const firstPremiumBlind = userStore.buyBlindBox('bob', PREMIUM_BLIND_BOX_ID, () => 0);
assertOk(firstPremiumBlind, 'premium blindbox buy');
assert.strictEqual(firstPremiumBlind.price, 1000);
assert(premiumCardBackIds.includes(firstPremiumBlind.cardBackId));
assert.notStrictEqual(firstPremiumBlind.cardBackId, retainedPremiumId);
assert.strictEqual(firstPremiumBlind.profile.coins, 0);

bobUser.coins = 1000;
userStore._save();
const secondPremiumBlind = userStore.buyBlindBox('bob', PREMIUM_BLIND_BOX_ID, () => 0);
assertOk(secondPremiumBlind, 'second premium blindbox buy');
assert.notStrictEqual(secondPremiumBlind.cardBackId, firstPremiumBlind.cardBackId);
assert.strictEqual(
  new Set(secondPremiumBlind.profile.ownedCardBacks.filter((id) => premiumCardBackIds.includes(id))).size,
  3,
);

bobUser.coins = 3000;
userStore._save();

const petBlind = userStore.buyPetBlindBox('bob', 'pet-blindbox', () => 0);
assertOk(petBlind, 'pet blindbox buy');
assert.strictEqual(petBlind.rewardType, 'pet');
assert.strictEqual(petBlind.price, 1000);
assert(petBlind.petId);
assert(petBlind.profile.ownedPets.includes(petBlind.petId));
assert.strictEqual(petBlind.profile.equippedPet, '', 'pet blindbox does not auto-equip');
const secondPetBlind = userStore.buyPetBlindBox('bob', 'pet-blindbox', () => 0);
assertOk(secondPetBlind, 'second pet blindbox buy');
assert.notStrictEqual(secondPetBlind.petId, petBlind.petId);

const equipPet = userStore.updatePet('bob', petBlind.petId);
assertOk(equipPet, 'equip pet');
assert.strictEqual(equipPet.profile.equippedPet, petBlind.petId);
assert.strictEqual(userStore.getPublicProfile('bob').pet, petBlind.petId);
const unequipPet = userStore.updatePet('bob', '');
assertOk(unequipPet, 'unequip pet');
assert.strictEqual(unequipPet.profile.equippedPet, '');
assert.strictEqual(userStore.updatePet('bob', 'not-a-pet').error, '宠物不存在');
assert.strictEqual(userStore.updatePet('bob', 'tiger').error, '尚未拥有该宠物');

for (const item of catalogStore.getBlindBoxDropPool(userStore.getProfile('bob').ownedCardBacks)) {
  bobUser.ownedCardBacks.push(item.cardBackId);
}
userStore._save();
assert.strictEqual(
  userStore.buyBlindBox('bob', 'cardback-blindbox', () => 0).error,
  'No available card backs in blind box',
);

for (const item of catalogStore.getCardBackBlindBoxDropPool(
  premiumBlindBox,
  userStore.getProfile('bob').ownedCardBacks,
)) {
  bobUser.ownedCardBacks.push(item.cardBackId);
}
bobUser.coins = 1000;
userStore._save();
assert.strictEqual(
  userStore.buyBlindBox('bob', PREMIUM_BLIND_BOX_ID, () => 0).error,
  'No available card backs in blind box',
);

for (const pet of catalogStore.getPetBlindBoxDropPool(userStore.getProfile('bob').ownedPets)) {
  bobUser.ownedPets.push(pet.id);
}
userStore._save();
assert.strictEqual(
  userStore.buyBlindBox('bob', 'pet-blindbox', () => 0).error,
  '宠物已收集完',
);

console.log('PASS admin/gift/shop rules');

try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {}
