'use client'

import { Line, Bar, Doughnut, Pie } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
)

export default function DashboardChart({ type = 'line', data, labels, label = 'Data' }) {
  const isDark = typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : true
  
  const chartData = {
    labels: data?.labels || labels || [],
    datasets: [
      {
        label,
        data: data?.values || data || [],
        backgroundColor: [
          'rgba(99, 102, 241, 0.8)',
          'rgba(236, 72, 153, 0.8)',
          'rgba(6, 182, 212, 0.8)',
          'rgba(34, 197, 94, 0.8)',
          'rgba(245, 158, 11, 0.8)',
        ],
        borderColor: [
          'rgb(99, 102, 241)',
          'rgb(236, 72, 153)',
          'rgb(6, 182, 212)',
          'rgb(34, 197, 94)',
          'rgb(245, 158, 11)',
        ],
        borderWidth: 2,
        tension: 0.4,
        fill: type === 'line'
      }
    ]
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: type === 'doughnut' || type === 'pie',
        labels: {
          color: isDark ? '#94a3b8' : '#475569'
        }
      }
    },
    scales: type === 'line' || type === 'bar' ? {
      y: {
        grid: {
          color: isDark ? '#334155' : '#e2e8f0'
        },
        ticks: {
          color: isDark ? '#94a3b8' : '#64748b'
        }
      },
      x: {
        grid: {
          display: false
        },
        ticks: {
          color: isDark ? '#94a3b8' : '#64748b'
        }
      }
    } : {}
  }

  const ChartComponent = {
    line: Line,
    bar: Bar,
    doughnut: Doughnut,
    pie: Pie
  }[type] || Line

  return (
    <div className="h-64">
      <ChartComponent data={chartData} options={options} />
    </div>
  )
}
