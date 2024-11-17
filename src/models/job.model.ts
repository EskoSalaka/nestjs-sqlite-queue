import { Column, DataType, Index, Model, Table, type Sequelize } from 'sequelize-typescript'

export enum JobStatus {
  NEW = 'NEW',
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
  status:
    | JobStatus.DONE
    | JobStatus.FAILED
    | JobStatus.NEW
    | JobStatus.STALLED
    | JobStatus.PROCESSING
  createdAt: Date
  processingAt: Date
  doneAt: Date
  stalledAt: Date
  failedAt: Date
  updatedAt: Date
}

export type JSONValue = string | number | boolean | null | JSONObject | JSONArray

export interface JSONObject {
  [x: string]: JSONValue
}

interface JSONArray extends Array<JSONValue> {}

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
    values: [JobStatus.NEW, JobStatus.PROCESSING, JobStatus.DONE, JobStatus.FAILED],
  })
  @Index({})
  status: JobStatus

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
          JobStatus.NEW,
          JobStatus.PROCESSING,
          JobStatus.DONE,
          JobStatus.STALLED,
          JobStatus.FAILED,
        ],
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
