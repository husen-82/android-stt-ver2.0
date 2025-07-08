import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface CalendarPopupProps {
  onClose: () => void;
}

const HOLIDAYS = {
  '2025-01-01': '元日',
  '2025-01-13': '成人の日',
  '2025-02-11': '建国記念の日',
  '2025-02-23': '天皇誕生日',
  '2025-03-20': '春分の日',
  '2025-04-29': '昭和の日',
  '2025-05-03': '憲法記念日',
  '2025-05-04': 'みどりの日',
  '2025-05-05': 'こどもの日',
  '2025-07-21': '海の日',
  '2025-08-11': '山の日',
  '2025-09-15': '敬老の日',
  '2025-09-23': '秋分の日',
  '2025-10-13': 'スポーツの日',
  '2025-11-03': '文化の日',
  '2025-11-23': '勤労感謝の日',
  '2025-11-24': '振替休日',
  '2026-01-01': '元日',
  '2026-01-12': '成人の日',
  '2026-02-11': '建国記念の日',
  '2026-02-23': '天皇誕生日',
  '2026-03-20': '春分の日',
  '2026-04-29': '昭和の日',
  '2026-05-03': '憲法記念日',
  '2026-05-04': 'みどりの日',
  '2026-05-05': 'こどもの日',
  '2025-05-06': '振替休日',
  '2026-07-20': '海の日',
  '2026-08-11': '山の日',
  '2026-09-21': '敬老の日',
  '2026-09-23': '秋分の日',
  '2026-10-12': 'スポーツの日',
  '2026-11-03': '文化の日',
  '2026-11-23': '勤労感謝の日',
};

export const CalendarPopup: React.FC<CalendarPopupProps> = ({ onClose }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const today = new Date();
  const currentYear = currentMonth.getFullYear();
  const currentMonthIndex = currentMonth.getMonth();

  const daysInMonth = new Date(currentYear, currentMonthIndex + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonthIndex, 1).getDay();
  
  const monthNames = [
    '1月', '2月', '3月', '4月', '5月', '6月',
    '7月', '8月', '9月', '10月', '11月', '12月'
  ];

  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

  const goToPreviousMonth = () => {
    const newDate = new Date(currentYear, currentMonthIndex - 1, 1);
    if (newDate.getFullYear() >= 2025) {
      setCurrentMonth(newDate);
    }
  };

  const goToNextMonth = () => {
    const newDate = new Date(currentYear, currentMonthIndex + 1, 1);
    if (newDate.getFullYear() <= 2026) {
      setCurrentMonth(newDate);
    }
  };

  const formatDateKey = (year: number, month: number, day: number) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const isToday = (day: number) => {
    return today.getFullYear() === currentYear &&
           today.getMonth() === currentMonthIndex &&
           today.getDate() === day;
  };

  const isHoliday = (day: number) => {
    const dateKey = formatDateKey(currentYear, currentMonthIndex, day);
    return HOLIDAYS[dateKey as keyof typeof HOLIDAYS];
  };

  const getDayColor = (day: number, dayOfWeek: number) => {
    if (isHoliday(day)) return 'text-red-600';
    if (dayOfWeek === 0) return 'text-red-600'; // Sunday
    if (dayOfWeek === 6) return 'text-blue-600'; // Saturday
    return 'text-gray-700';
  };

  const renderCalendarDays = () => {
    const days = [];
    
    // Empty cells for days before the first day of the month
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} className="h-10"></div>);
    }
    
    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dayOfWeek = (firstDayOfWeek + day - 1) % 7;
      const holiday = isHoliday(day);
      
      days.push(
        <div
          key={day}
          className={`h-10 flex items-center justify-center relative ${getDayColor(day, dayOfWeek)}`}
        >
          {isToday(day) && (
            <div className="absolute inset-0 rounded-full border-2 border-red-500"></div>
          )}
          <span className="font-medium relative z-10">{day}</span>
          {holiday && (
            <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2">
              <div className="w-1 h-1 bg-red-500 rounded-full"></div>
            </div>
          )}
        </div>
      );
    }
    
    return days;
  };

  //カレンダーの見た目
  return (
    <div //外枠
      className="fixed inset-0 bg-transparent bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div //本体
        className="bg-white bg-opacity-20 rounded-lg shadow-2xl max-w-sm w-full animate-fade-in " //カレンダーの本体見たい目
        //className="bg-white bg-opacity-20 rounded-lg shadow-2xl w-[90%] max-w-[600px] h-[85%] animate-fade-in"
        style={{
              backgroundColor:'rgba(250,250,250,0.95)'
        }}
        >
        <div //ヘッダー
          className="p-4 border-b border-gray-200 flex items-center justify-between">
          <button
            onClick={goToPreviousMonth}
            disabled={currentYear <= 2025 && currentMonthIndex <= 0}
            className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={20} />
          </button>
          
          <h2 className="text-lg font-bold text-[#333333]">
            {currentYear}年{monthNames[currentMonthIndex]}
          </h2>
          
          <button
            onClick={goToNextMonth}
            disabled={currentYear >= 2026 && currentMonthIndex >= 11}
            className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight size={20} />
          </button>
        </div>
        
        <div className="p-4">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {dayNames.map((dayName, index) => (
              <div
                key={dayName}
                className={`h-8 flex items-center justify-center text-sm font-medium ${
                  index === 0 ? 'text-red-600' : index === 6 ? 'text-blue-600' : 'text-gray-500'
                }`}
              >
                {dayName}
              </div>
            ))}
          </div>
          
          {/* Calendar days */}
          <div className="grid grid-cols-7 gap-1">
            {renderCalendarDays()}
          </div>
        </div>
        
        <div //フッター
          className="p-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#007bff] text-white rounded-md hover:bg-blue-600 transition-colors duration-200 flex items-center gap-2"
          >
            <X size={16} />
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};