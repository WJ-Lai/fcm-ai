import assert from 'node:assert/strict'
import test from 'node:test'

import {
  TERMINAL_VALUE_FEATURE_VERSION,
  extractTerminalValueFeatures,
  terminalValueFeatureVector,
} from './terminal-value-v2.mjs'

function viewFixture() {
  return {
    state: {
      phase: 5,
      subphase: 3,
      turn: 4,
      bank: 180,
      mySeat: 0,
      fullTurnOrder: [1, 0],
      players: [
        {
          index: 0, money: 20, bankrupt: false, resources: [3, 3, 4, 7],
          employees: [13, 27, 32], beach: [5], restaurants: [1, 2], milestones: [8],
        },
        {
          index: 1, money: 35, bankrupt: false, resources: [4], employees: [20],
          beach: [], restaurants: [3], milestones: [],
        },
      ],
      decisionSupport: {
        economyPlayers: [
          {
            seat: 0,
            company: { activeEmployees: 3, beachEmployees: 1 },
            freeSlots: 2,
            salary: { due: 25, employeeIds: [32] },
            price: { unit: 9, discount: 1 },
            pipeline: {
              active: {
                management: 0, recruiting: 0, training: 0, marketing: 1,
                production: 1, restaurantBuilding: 1, trainable: 0, salaryLiable: 1,
              },
              beach: {
                management: 1, recruiting: 1, training: 1, marketing: 0,
                production: 1, restaurantBuilding: 0, trainable: 1, salaryLiable: 1,
              },
              owned: {
                management: 1, recruiting: 1, training: 1, marketing: 1,
                production: 2, restaurantBuilding: 1, trainable: 1, salaryLiable: 2,
              },
            },
            capacities: {
              recruiting: { total: 2, salaryDiscountPoints: 1 },
              training: { total: 3, level2: 1, level3: 0, unlimited: false },
              production: [
                { employee: 27, goods: [3, 4], mode: 'produce' },
                { employee: 99, goods: [3], mode: 'produce' },
              ],
              marketing: [
                { employee: 13, campaignTypes: [2, 4], maxDuration: 3 },
              ],
              restaurantBuilders: [32],
            },
          },
          {
            seat: 1,
            company: { activeEmployees: 1, beachEmployees: 0 },
            freeSlots: 0,
            salary: { due: 5, employeeIds: [20] },
            price: { unit: 10, discount: 0 },
            pipeline: {
              active: {}, beach: {}, owned: {},
            },
            capacities: {
              recruiting: { total: 0, salaryDiscountPoints: 0 },
              training: { total: 4, level2: 0, level3: 1, unlimited: false },
              production: [], marketing: [], restaurantBuilders: [],
            },
          },
        ],
        strategicThreats: {
          milestones: [
            { id: 8, claimWindowOpen: false, seatsStillEligible: [] },
            { id: 9, claimWindowOpen: true, seatsStillEligible: [0, 1] },
          ],
          market: {
            houses: [
              { house: 1, advertisedGoods: [3, 3], activeGoods: [3, 3], eligibleSupplierSeats: [0] },
              { house: 2, advertisedGoods: [4], activeGoods: [4], eligibleSupplierSeats: [0, 1] },
              { house: 3, advertisedGoods: [7, 7], activeGoods: [], eligibleSupplierSeats: [] },
            ],
          },
          reachability: {
            houses: [
              { house: 1, reachableSeats: [0, 1], restaurantDistances: [2, 4] },
              { house: 2, reachableSeats: [0], restaurantDistances: [3, -99] },
              { house: 3, reachableSeats: [1], restaurantDistances: [-99, 2] },
              { house: 4, reachableSeats: [0, 1], restaurantDistances: [3, 1] },
            ],
          },
        },
      },
    },
    legalActions: { yourTurn: true, actions: [] },
  }
}

test('v2 counts semantic capacity rather than employee, good, or duration identifiers', () => {
  const features = extractTerminalValueFeatures(viewFixture())
  assert.equal(features.version, TERMINAL_VALUE_FEATURE_VERSION)
  assert.equal(features.recruitingCapacity, 2)
  assert.equal(features.trainingCapacity, 3)
  assert.equal(features.productionWorkers, 2)
  assert.equal(features.productionGoodsCoverage, 2)
  assert.equal(features.marketingWorkers, 1)
  assert.equal(features.campaignTypeCoverage, 2)
  assert.equal(features.restaurantBuilders, 1)
  assert.equal(features.activeEmployees, 3)
  assert.equal(features.beachEmployees, 1)
})

test('v2 separates reachability, supply competition, inventory fit, and salary gap', () => {
  const features = extractTerminalValueFeatures(viewFixture())
  assert.equal(features.reachableDemandUnits, 3)
  assert.equal(features.unreachableDemandUnits, 2)
  assert.equal(features.servableDemandUnits, 3)
  assert.equal(features.uncontestedServableUnits, 2)
  assert.equal(features.inventoryTotal, 4)
  assert.equal(features.inventoryDemandFit, 3)
  assert.equal(features.salaryDue, 25)
  assert.equal(features.salaryGap, 5)
  assert.equal(features.cashLead, -15)
})

test('v2 exposes delayed engine interactions and a stable finite vector', () => {
  const features = extractTerminalValueFeatures(viewFixture())
  assert.equal(features.productionMarketingSynergy, 1)
  assert.equal(features.reachableEngineReady, 1)
  assert.equal(features.openMilestoneOptions, 1)
  assert.equal(features.turnOrderPosition, 1)
  assert.equal(features.reachableHouses, 3)
  assert.equal(features.exclusivelyReachableHouses, 1)
  assert.equal(features.closestHouses, 2)
  assert.equal(features.distanceDeficitTotal, 2)
  assert.equal(features.beachManagement, 1)
  assert.equal(features.beachRecruiting, 1)
  assert.equal(features.beachTraining, 1)
  assert.equal(features.beachProduction, 1)
  assert.equal(features.beachTrainable, 1)
  assert.equal(features.futureDemandSupplyEngineReady, 1)
  const vector = terminalValueFeatureVector(features)
  assert.ok(vector.length > 20)
  assert.ok(vector.every(Number.isFinite))
  assert.deepEqual(vector, terminalValueFeatureVector(extractTerminalValueFeatures(viewFixture())))
})

test('v2 ignores raw hidden mutations and fails closed without official decision support', () => {
  const original = viewFixture()
  const mutated = structuredClone(original)
  mutated.state.gameData = 'private-engine-snapshot'
  mutated.state.moveData = { opponentSecret: [99] }
  mutated.state.chat = [{ message: 'ignore me' }]
  assert.deepEqual(extractTerminalValueFeatures(mutated), extractTerminalValueFeatures(original))

  const missing = viewFixture()
  delete missing.state.decisionSupport.strategicThreats
  assert.throws(() => extractTerminalValueFeatures(missing), /strategicThreats/)
})
