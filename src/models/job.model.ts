import { DataTypes, Model, type Sequelize } from 'sequelize'
import { JobStatus, type Job, type JSONObject } from '../sqlite-queue.interfaces'
import {
  SQLITE_QUEUE_DEFAULT_JOB_FAIL_ON_STALLED,
  SQLITE_QUEUE_DEFAULT_JOB_RETRIES,
  SQLITE_QUEUE_DEFAULT_JOB_TIMEOUT,
} from '../sqlite-queue.constants'

export class JobModel extends Model<Job> {
  id: number
  name: string
  data?: JSONObject
  resultData?: JSONObject
  status: JobStatus
  priority: number

  retries: number
  retriesAttempted: number
  timeout: number
  failOnTimeout: boolean
  errorMessage: string
  errorStack: string

  createdAt: Date
  processingAt?: Date
  doneAt?: Date
  failedAt?: Date
  stalledAt?: Date
  updatedAt: Date

  processAfter: Date

  removeOnComplete: boolean
  removeOnFail: boolean
}

const JobModelDefinition: Record<keyof Job, any> = {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
  },
  data: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: null,
  },
  resultData: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: null,
  },
  status: {
    type: DataTypes.INTEGER,
    allowNull: false,
    values: [
      JobStatus.WAITING,
      JobStatus.PROCESSING,
      JobStatus.DONE,
      JobStatus.STALLED,
      JobStatus.FAILED,
    ],
  },
  priority: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },

  retries: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: SQLITE_QUEUE_DEFAULT_JOB_RETRIES,
  },
  retriesAttempted: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  timeout: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: SQLITE_QUEUE_DEFAULT_JOB_TIMEOUT,
  },
  failOnTimeout: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: SQLITE_QUEUE_DEFAULT_JOB_FAIL_ON_STALLED,
  },
  errorMessage: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
  },
  errorStack: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
  },

  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  processingAt: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
  },
  doneAt: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
  },
  stalledAt: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
  },
  failedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },

  processAfter: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
  },

  removeOnComplete: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },

  removeOnFail: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
}

export function createJobModelDefinition(
  tableName: string = 'default_queue',
  sequelize: Sequelize
) {
  return sequelize.define(tableName, JobModelDefinition, {
    tableName,
    timestamps: true,
    deletedAt: false,
    indexes: [
      {
        name: 'idx_status',
        fields: ['status'],
      },
      {
        name: 'idx_processAfter',
        fields: [{ name: 'processAfter' }],
      },
      {
        name: 'idx_priority_desc',
        fields: [{ name: 'priority', order: 'DESC' }],
      },
      {
        name: 'idx_status_processAfter_priority_desc_id_asc',
        fields: [
          'status',
          'processAfter',
          { name: 'priority', order: 'DESC' },
          { name: 'id', order: 'ASC' },
        ],
      },
    ],
  })
}
