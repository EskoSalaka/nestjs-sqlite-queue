import { DataTypes, Model, type Sequelize } from 'sequelize'
import { JobStatus, type Job, type JSONObject } from '../sqlite-queue.interfaces'

export class JobModel extends Model<Job> {
  id: number
  name: string
  data?: JSONObject
  resultData?: JSONObject
  status: JobStatus

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
    type: DataTypes.ENUM,
    values: [
      JobStatus.WAITING,
      JobStatus.PROCESSING,
      JobStatus.DONE,
      JobStatus.STALLED,
      JobStatus.FAILED,
    ],
  },

  retries: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
  },
  retriesAttempted: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
  },
  timeout: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  failOnTimeout: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
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
    allowNull: true,
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
  },

  processAfter: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
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
        fields: ['status'],
      },
      {
        fields: ['createdAt'],
      },
      {
        fields: ['processAfter'],
      },
    ],
  })
}
