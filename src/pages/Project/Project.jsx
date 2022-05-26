import React, { useState, useEffect, useMemo, memo } from 'react'
import { useHistory, useParams } from 'react-router-dom'
import Flag from 'react-flagkit'
import countries from 'i18n-iso-countries'
import countriesEn from 'i18n-iso-countries/langs/en.json'
import cx from 'clsx'
import PropTypes from 'prop-types'
import _keys from 'lodash/keys'
import _map from 'lodash/map'
import _includes from 'lodash/includes'
import _last from 'lodash/last'
import _truncate from 'lodash/truncate'
import _isEmpty from 'lodash/isEmpty'
import _find from 'lodash/find'
import _filter from 'lodash/filter'

import {
  periodPairs, getProjectCacheKey, LIVE_VISITORS_UPDATE_INTERVAL,
} from '../../redux/constants'
import {
  getProjectData, getLiveVisitors,
} from '../../api'
import Loader from '../../ui/Loader'
import Dropdown from '../../ui/Dropdown'
import Loading from '../../components/Loading'
import { isAuthenticated } from '../../hoc/protected'
import routes from '../../routes'
import { Panel, Overview, CustomEvents } from './Panels'

countries.registerLocale(countriesEn)

const tnMapping = {
  cc: 'Country',
  pg: 'Page',
  lc: 'Locale',
  ref: 'Referrer',
  dv: 'Device type',
  br: 'Browser',
  os: 'OS name',
  so: 'utm_source',
  me: 'utm_medium',
  ca: 'utm_campaign',
  lt: 'Load time',
}

const NoEvents = () => (
  <div className='flex flex-col py-6 sm:px-6 lg:px-8 mt-5'>
    <div className='max-w-7xl w-full mx-auto'>
      <h2 className='text-4xl text-center leading-tight my-3'>
        No events for the selected timeframe
      </h2>
    </div>
  </div>
)

const Filter = ({
  column, filter, isExclusive, onRemoveFilter, onChangeExclusive, tnMapping
}) => {
  const displayColumn = tnMapping[column]
  let displayFilter = filter

  if (column === 'cc') {
    displayFilter = countries.getName(filter, 'en')
  }

  displayFilter = _truncate(displayFilter)

  return (
    <span className='inline-flex rounded-md items-center py-0.5 pl-2.5 pr-1 mr-2 mt-2 text-sm font-medium bg-gray-200 text-gray-800 dark:text-gray-50 dark:bg-gray-700'>
      {displayColumn}
      &nbsp;
      <span className='text-blue-400 border-blue-400 border-b-2 border-dotted cursor-pointer' onClick={() => onChangeExclusive(column, filter, !isExclusive)}>
        {isExclusive ? 'is Not' : 'is'}
      </span>
      &nbsp;
      &quot;
      {displayFilter}
      &quot;
      <button
        onClick={() => onRemoveFilter(column, filter)}
        type='button'
        className='flex-shrink-0 ml-0.5 h-4 w-4 rounded-full inline-flex items-center justify-center text-gray-800 hover:text-gray-900 hover:bg-gray-300 focus:bg-gray-300 focus:text-gray-900 dark:text-gray-50 dark:bg-gray-700 dark:hover:text-gray-300 dark:hover:bg-gray-800 dark:focus:bg-gray-800 dark:focus:text-gray-300 focus:outline-none '
      >
        <span className='sr-only'>Remove filter</span>
        <svg className='h-2 w-2' stroke='currentColor' fill='none' viewBox='0 0 8 8'>
          <path strokeLinecap='round' strokeWidth='1.5' d='M1 1l6 6m0-6L1 7' />
        </svg>
      </button>
    </span>
  )
}

const Filters = ({
  filters, onRemoveFilter, onChangeExclusive, tnMapping,
}) => (
  <div className='flex justify-center md:justify-start flex-wrap -mt-2'>
    {_map(filters, (props) => {
      const { column, filter } = props
      const key = `${column}${filter}`

      return (
        <Filter key={key} onRemoveFilter={onRemoveFilter} onChangeExclusive={onChangeExclusive} tnMapping={tnMapping} {...props} />
      )
    })}
  </div>
)

const Project = ({
  projects, isLoading, cache, setProjectCache, projectViewPrefs, setProjectViewPrefs, setLiveStatsForProject,
}) => {
  const { id } = useParams()
  const history = useHistory()
  const project = useMemo(() => _find(projects, p => p.id === id) || {}, [projects, id])
  const [panelsData, setPanelsData] = useState({})
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [period, setPeriod] = useState(projectViewPrefs[id]?.period || periodPairs[0].period)
  const [timeBucket, setTimebucket] = useState(projectViewPrefs[id]?.timeBucket || periodPairs[0].tbs[1])
  const activePeriod = useMemo(() => _find(periodPairs, p => p.period === period), [period])
  const [chartData, setChartData] = useState({})
  const [filters, setFilters] = useState([])
  const { name } = project

  console.log(projects, cache, projectViewPrefs)

  const onErrorLoading = () => {
    history.push(routes.dashboard)
  }

  const loadAnalytics = async (forced = false, newFilters = null) => {
    if (forced || (!isLoading && !_isEmpty(project))) {
      try {
        let data
        const key = getProjectCacheKey(period, timeBucket)

        if (!forced && !_isEmpty(cache[id]) && !_isEmpty(cache[id][key])) {
          data = cache[id][key]
        } else {
          console.log(filters)
          data = await getProjectData(id, timeBucket, period, newFilters || filters, '', '')
          setProjectCache(id, period, timeBucket, data || {})
        }

        if (_isEmpty(data)) {
          setAnalyticsLoading(false)
          return
        }

        const { chart, params, customs } = data

        if (!_isEmpty(params)) {
          setChartData(chart)
          setPanelsData({
            types: _keys(params),
            data: params,
            customs,
          })
        }

        setAnalyticsLoading(false)
      } catch (error) {
        console.error(error)
      }
    }
  }

  const filterHandler = (column, filter, isExclusive = false) => {
    let newFilters

    // temporarily apply only 1 filter per data type
    if (_find(filters, (f) => f.column === column) /* && f.filter === filter) */) {
      // selected filter is already included into the filters array -> removing it
      newFilters = _filter(filters, (f) => f.column !== column)
      setFilters(newFilters)
    } else {
      // selected filter is not present in the filters array -> applying it
      newFilters = [
        ...filters,
        { column, filter, isExclusive },
      ]
      setFilters(newFilters)
    }

    loadAnalytics(true, newFilters)
  }

  const onChangeExclusive = (column, filter, isExclusive) => {
    const newFilters = _map(filters, (f) => {
      if (f.column === column && f.filter === filter) {
        return {
          ...f,
          isExclusive,
        }
      }

      return f
    })

    setFilters(newFilters)
    loadAnalytics(true, newFilters)
  }

  useEffect(() => {
    loadAnalytics()
  }, [project, period, timeBucket]) // eslint-disable-line

  useEffect(() => {
    if (!isLoading && _isEmpty(project)) {
      onErrorLoading()
    }
  }, [isLoading, project]) // eslint-disable-line

  const updatePeriod = (newPeriod) => {
    const newPeriodFull = _find(periodPairs, (el) => el.period === newPeriod)
    let tb = timeBucket
    if (_isEmpty(newPeriodFull)) {
      return
    }

    if (!_includes(newPeriodFull.tbs, timeBucket)) {
      tb = _last(newPeriodFull.tbs)
      setTimebucket(tb)
    }

    setPeriod(newPeriod)
    setProjectViewPrefs(id, newPeriod, tb)
  }

  const isPanelsDataEmpty = _isEmpty(panelsData)

  if (!isLoading) {
    return (
      <div className='dark:bg-gray-800 py-2 px-4'>
        <div className='flex flex-col items-center justify-between'>
          <h2 className='text-2xl font-extrabold text-gray-900 dark:text-gray-50 break-words'>{name}</h2>
          <div className='flex mt-2'>
            <Dropdown
              items={periodPairs}
              title={activePeriod.label}
              labelExtractor={pair => pair.label}
              keyExtractor={pair => pair.label}
              onSelect={pair => updatePeriod(pair.period)}
            />
          </div>
        </div>
        {isPanelsDataEmpty && (
          analyticsLoading ? (
            <Loader className='flex justify-center mt-4' />
          ) : (
            <NoEvents />
          )
        )}
        <div className={cx('pt-4', { hidden: isPanelsDataEmpty })}>
          <div>
            <Filters
              filters={filters}
              onRemoveFilter={filterHandler}
              onChangeExclusive={onChangeExclusive}
              tnMapping={tnMapping}
            />
          </div>
          <div className='grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3'>
            {!_isEmpty(project.overall) && (
              <Overview
                overall={project.overall}
                chartData={chartData}
                activePeriod={activePeriod}
                live={project.live}
              />
            )}
            {_map(panelsData.types, type => {
              if (type === 'cc') {
                return (
                  <Panel
                    key={type}
                    type={type}
                    name={tnMapping[type]}
                    data={panelsData.data[type]}
                    onFilter={filterHandler}
                    rowMapper={(name) => (
                      <>
                        <Flag className='rounded-md' country={name} size={21} alt='' />
                        &nbsp;&nbsp;
                        {countries.getName(name, 'en', {
                          select: 'alias',
                        })}
                      </>
                    )}
                  />
                )
              }

              if (type === 'dv') {
                return (
                  <Panel key={type} type={type} capitalize onFilter={filterHandler} name={tnMapping[type]} data={panelsData.data[type]} />
                )
              }

              if (type === 'ref') {
                return (
                  <Panel
                    key={type}
                    type={type}
                    name={tnMapping[type]}
                    data={panelsData.data[type]}
                    onFilter={filterHandler}
                    rowMapper={(name) => {
                      const url = new URL(name)

                      return (
                        <div>
                          {showIcons && !_isEmpty(url.hostname) && (
                            <img className='w-5 h-5 mr-1.5 float-left' src={`https://icons.duckduckgo.com/ip3/${url.hostname}.ico`} alt='' />
                          )}
                          <a className='flex label overflow-visible hover:underline text-blue-600' href={name} target='_blank' rel='noopener noreferrer'>
                            {name}
                          </a>
                        </div>
                      )
                    }}
                  />
                )
              }

              return (
                <Panel key={type} type={type} onFilter={filterHandler} name={tnMapping[type]} data={panelsData.data[type]} />
              )
            })}
            {!_isEmpty(panelsData.customs) && (
              <CustomEvents customs={panelsData.customs} chartData={chartData} />
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <Loading />
  )
}

Project.propTypes = {
  projects: PropTypes.arrayOf(PropTypes.object).isRequired,
  cache: PropTypes.objectOf(PropTypes.object).isRequired,
  projectViewPrefs: PropTypes.objectOf(PropTypes.object).isRequired,
  setProjectCache: PropTypes.func.isRequired,
  setProjectViewPrefs: PropTypes.func.isRequired,
  isLoading: PropTypes.bool.isRequired,
  setLiveStatsForProject: PropTypes.func.isRequired,
}

export default isAuthenticated(memo(Project))
