import { Column, DataType, Index, Model, Table, type Sequelize } from 'sequelize-typescript'

export enum JobStatus {
  WAITING = 'WAITING',
  PROCESSING = 'PROCESSING',
  DONE = 'DONE',
  STALLED = 'STALLED',
  FAILED = 'FAILED',
}

export interface Job {
  id: number
  name: string
  data: JSONObject
  resultData: JSONObject
  status: JobStatus
  retries: number
  retried: number
  timeout: number
  failOnTimeout: boolean
  createdAt: Date
  processingAt: Date
  doneAt: Date
  stalledAt: Date
  failedAt: Date
  updatedAt: Date
}

interface JSONArray extends Array<JSONValue> {}
export type JSONValue = string | number | boolean | null | JSONObject | JSONArray
export interface JSONObject {
  [x: string]: JSONValue
}

@Table({
  tableName: 'default_queue',
  timestamps: true,
  deletedAt: false,
})
export class JobModel extends Model<Job> {
  @Column({
    primaryKey: true,
    autoIncrement: true,
    type: DataType.INTEGER,
  })
  id: number

  @Column({ type: DataType.STRING })
  name: string

  @Column({ allowNull: true, type: DataType.JSON })
  data?: JSONObject

  @Column({ allowNull: true, type: DataType.JSON })
  resultData?: JSONObject

  @Column({
    type: DataType.ENUM,
    values: [JobStatus.WAITING, JobStatus.PROCESSING, JobStatus.DONE, JobStatus.FAILED],
  })
  @Index({})
  status: JobStatus

  @Column({ allowNull: true, defaultValue: 0 })
  retries: number

  @Column({ allowNull: true, defaultValue: 0 })
  retried: number

  @Column({ allowNull: false, defaultValue: 30000 })
  timeout: number

  @Column({ allowNull: false, defaultValue: false })
  failOnTimeout: boolean

  @Column({})
  @Index({})
  createdAt: Date

  @Column({ allowNull: true })
  processingAt?: Date

  @Column({ allowNull: true })
  doneAt?: Date

  @Column({ allowNull: true })
  failedAt?: Date

  @Column({ allowNull: true })
  stalledAt?: Date

  @Column({})
  updatedAt: Date
}

export function createJobModelDefinition(tableName: string, sequelize: Sequelize) {
  return sequelize.define(
    tableName,
    {
      id: {
        type: DataType.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataType.STRING,
        allowNull: true,
        defaultValue: null,
      },
      data: {
        type: DataType.JSON,
        allowNull: true,
        defaultValue: null,
      },
      resultData: {
        type: DataType.JSON,
        allowNull: true,
        defaultValue: null,
      },
      status: {
        type: DataType.ENUM,
        values: [
          JobStatus.WAITING,
          JobStatus.PROCESSING,
          JobStatus.DONE,
          JobStatus.STALLED,
          JobStatus.FAILED,
        ],
      },
      retries: {
        type: DataType.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      retried: {
        type: DataType.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      timeout: {
        type: DataType.INTEGER,
        allowNull: false,
      },
      failOnTimeout: {
        type: DataType.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      createdAt: {
        type: DataType.DATE,
        allowNull: true,
        defaultValue: DataType.NOW,
      },
      processingAt: {
        type: DataType.DATE,
        allowNull: true,
        defaultValue: null,
      },
      doneAt: {
        type: DataType.DATE,
        allowNull: true,
        defaultValue: null,
      },
      stalledAt: {
        type: DataType.DATE,
        allowNull: true,
        defaultValue: null,
      },
      failedAt: {
        type: DataType.DATE,
        allowNull: true,
        defaultValue: null,
      },
      updatedAt: {
        type: DataType.DATE,
      },
    },
    {
      tableName,
      timestamps: true,
      deletedAt: false,
      indexes: [
        {
          fields: ['status'],
        },
        {
          fields: ['createdAt'],
        },
      ],
    }
  )
}
