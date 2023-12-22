import { Component, OnInit, ChangeDetectorRef, ViewChild, HostListener } from '@angular/core';
import { ButtonType, DataSource } from 'src/app/service/datasource';
import { environment } from 'src/environment';
import { ElectronService } from 'ngx-electron';
import { DataStateChangeEvent, GridComponent, GridDataResult, RowClassArgs } from '@progress/kendo-angular-grid';
import { State, aggregateBy, process } from '@progress/kendo-data-query';
import { ExcelExportData } from '@progress/kendo-angular-excel-export';
import * as moment from 'moment';
import { AppNetworkStatus } from 'src/app/network-status';
import * as Notiflix from 'node_modules/notiflix/dist/notiflix-3.2.6.min.js';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  public ButtonType = ButtonType;
  @ViewChild('grid') grid: GridComponent;
  public view: GridDataResult;
  public list: any[] = [];
  public mySelections: any[] = [];
  public selectedItem: any = {};
  static componentInstance: any;
  private url: string = environment.production ? environment.apiUrl : '/api';
  public ddPlaka: DropdownProps = new DropdownProps();
  public ddFirma: DropdownProps = new DropdownProps();
  public formData: any;
  private emptyFormData: any = { FirmaAdi: '', Tonaj: 0, BelgeNo: '', Dara: 0, Aciklama: '' };
  public total: any = { "Tonaj": { "sum": 0 }, "Tutar": { "sum": 0 } };
  public basTar: Date;
  public bitTar: Date;
  public barcode: string = '';
  public isLoading: boolean = false;
  public raporTuru: any = { kamufis: false, dokumfisi: false, ozel: false, manueldokum: false, gerikazanim: false, evsel: false, sanayi: false };
  public user = JSON.parse(window.localStorage.getItem('user'));
  public depolamaAlanId = window.localStorage.getItem('DepolamaAlanId');
  public state: State = {
    skip: 0,
    take: 19,
  };

  constructor(private ds: DataSource, private _electronService: ElectronService, private ref: ChangeDetectorRef) {

    this.allData = this.allData.bind(this);
    DashboardComponent.componentInstance = this;
    if (this._electronService.ipcRenderer) {
      this._electronService.ipcRenderer.on('kantar', this.onDataKantar);
      this._electronService.ipcRenderer.on('tcp', this.onDataTcp);
    }
  }



  ngOnInit(): void {
    this.initializeFormData();
    var now = new Date();
    this.basTar = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    this.bitTar = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    this.BindGrid();
    this.BindForm();
  }


  @HostListener('window:keydown', ['$event'])
  keyEvent(event: KeyboardEvent) {
    if (event.key == 'Enter') {
      console.log(this.barcode);
      var belgeNo = this.belgeNoFromBarcode(this.barcode);
      // var index=belgeNo.indexOf("A")+1;
      // var lastindex=belgeNo.lastIndexOf("A");
      // var belge=belgeNo.substring(index,lastindex);


      this.barcode = '';
      return;
    }
    this.barcode += event.key;
  }

  public async belgeNoFromBarcode(code) {
    var barkodBelge = code.replaceAll('Shift', '').replaceAll('Control', '').replaceAll('*', '-');
    this.formData.BelgeNo = barkodBelge;

    var tasimaKabulKontrol = await this.ds.postNoMess(`${this.url}/kantar/KabulBelgesiKontrol`, { BelgeNo: barkodBelge, BarkodNo: barkodBelge });
    if (tasimaKabulKontrol.success == true) {
      if (tasimaKabulKontrol.data.Aktif == false) {
        Notiflix.Notify.failure('Taşıma Kabul Belgesi Aktif Değildir!');
        return;
      }
      else {
        this.ddPlaka.f_list = this.ddPlaka.list.filter(x => tasimaKabulKontrol.data.Araclar.some(a => a.PlakaNo == x.PlakaNo))
        this.formData.FirmaAdi = tasimaKabulKontrol.data.FirmaAdi;
        this.formData.Dara = 0;
        this.formData.AracId = undefined;

        setTimeout(() => {
          this.save();
        }, 2000);

        return barkodBelge;
      }
    }
    else {
      Notiflix.Notify.failure('Geçersiz Belge No!');
    }

  }

  public plakaChange(aracId) {
    const arac = this.ddPlaka.list.filter((x) => x.AracId == aracId)[0];
    if (arac != undefined && arac != null) {
      this.formData.AracId = arac.AracId;
      this.formData.Dara = arac.Dara;

      setTimeout(() => {
        this.save();
      }, 2000);

    }
  }

  public async BindForm() {
    this.ddPlaka = new DropdownProps("PlakaNo", await this.ds.get(`${this.url}/kantar/araclistesi?EtiketNo=`));
    this.ddFirma = new DropdownProps("FirmaAdi", await this.ds.get(`${this.url}/FirmaListesiMini?BuyukSehirId=1`));
  }


  public async BindGrid() {

    this.clearSelections();

    if (this.basTar != undefined && this.bitTar != undefined) {
      var query = this.user.buyuksehirid + "#" + this.basTar.toUTCString() + "#" + this.bitTar.toUTCString() + "#" + "" + "#" + this.depolamaAlanId + "#" + "" + "#" + this.raporTuru.kamufis + "#" + this.raporTuru.dokumfisi + "#" + this.raporTuru.ozel + "#" + this.raporTuru.manueldokum + "#" + this.raporTuru.gerikazanim + "#" + "Hayir" + "#" + this.raporTuru.evsel + "#" + this.raporTuru.sanayi + "#" + this.user.userid;

      this.list = await this.ds.get(`${this.url}/ParaYukleme/GetRaporMulti?q=${btoa(query)}`);
      this.view = process(this.list, this.state);
      this.total = aggregateBy(this.list, [{ field: 'Tonaj', aggregate: 'sum' }, { field: 'Tutar', aggregate: 'sum' }]);
    }


  }

  public initializeFormData() {
    this.formData = {};
    this.ref.detectChanges();
    for (const property in this.emptyFormData) this.formData[property] = this.emptyFormData[property];
    this.ref.detectChanges();
  }

  public onCellClick(a) {
    this.selectedItem = a.dataItem;
  }

  public dataStateChange(state: DataStateChangeEvent): void {
    this.state = state;
    this.view = process(this.list, this.state);
  }

  public rowCallback = (context: RowClassArgs) => {
    return { localData: context.dataItem.HafriyatDokumId == null };
  };

  async excel() {
    this.grid.saveAsExcel();
  }

  public allData(): ExcelExportData {
    var excelList = this.list;
    for (var item of excelList) {
      item.IslemTarihi = moment(new Date(item.IslemTarihi)).format("DD/MM/yyyy HH:mm");
    }
    const result: ExcelExportData = process(excelList, {});
    return result;
  }


  public print(data) {
    if (data == null) return;

    if (this._electronService.ipcRenderer)
      this._electronService.ipcRenderer.send('onprint', [data]);

    this.clearSelections();
  }

  public clearSelections() {
    this.selectedItem = undefined;
    this.mySelections = [];
  }

  onDataKantar(event, data) {
    console.log(data);
    const component = DashboardComponent.componentInstance;
    component.formData.Tonaj = parseInt(data[0]);
    component.ref.detectChanges();
    setTimeout(() => {
      component.save();
    }, 2000);
  }


  onDataTcp(event, data) {
    console.log(data);
    const component = DashboardComponent.componentInstance;
    var arac = component.ddPlaka.list.filter(x => x.OGSEtiket == data)[0];
    if (arac == undefined) {
      return;
    }
    component.formData.AracId = arac.AracId;
    component.ref.detectChanges();
    component.plakaChange(arac.AracId);

  }

  async daraGuncelle() {

    if (this.formData.AracId == null || this.formData.AracId == undefined || this.formData.Tonaj == null || this.formData.Tonaj < 1) {
      Notiflix.Notify.failure('Araç veya tonaj bilgisi alınamadı!');
      return;
    }

    const arac = this.ddPlaka.list.filter((x) => x.AracId == this.formData.AracId)[0];

    const willDelete = await Swal.fire({
      title: `${arac.PlakaNo} plakalı aracın darası ${this.formData.Tonaj} kg olarak güncellensin mi?`,
      type: 'warning',
      showCloseButton: false,
      showCancelButton: true,
      allowOutsideClick: false,
      cancelButtonText: 'Hayır',
      confirmButtonText: 'Evet',
    });

    if (willDelete.value != true) return;

    this.isLoading = true;
    var result = await this.ds.post(`${this.url}/kantar/DaraDegisimi`, { AracId: this.formData.AracId, Dara: this.formData.Tonaj });
    this.isLoading = false;
    if (result.success) {
      this.initializeFormData();
      this.ddPlaka = new DropdownProps("PlakaNo", await this.ds.get(`${this.url}/kantar/araclistesi?EtiketNo=`));
    }
  }

  async save() {
    var err = this.validations();
    if (err != '') {

      Notiflix.Notify.failure(err);
      return;
    }
    else if (this.isLoading==false) {
      this.isLoading = true;
      var result = await this.ds.post(`${this.url}/kantar/hafriyatkabul/KabulBelgesi`, { AracId: this.formData.AracId, FirmaId: null, SahaId: null, UserId: this.user.userid, BelgeNo: this.formData.BelgeNo, BarkodNo: this.formData.BelgeNo, DepolamaAlanId: this.depolamaAlanId, Tonaj: this.formData.Tonaj, Dara: this.formData.Dara, GirisCikis: 'Giriş' });
      this.isLoading = false;
      if (result.success) {
        if (this._electronService.ipcRenderer)
          this._electronService.ipcRenderer.send('bariyer');
        // this.print(result.data);
        this.initializeFormData();
        this.BindGrid();
      }
    }
  }


  public validations(): string {
    var s = '';
    if (this.formData.AracId == null) s = 'Lütfen plaka seçin.';
    else if (this.formData.FirmaAdi == null) s = 'Firma Adı bulunamadı.';
    else if (this.formData.BelgeNo == null || this.formData.BelgeNo=='') s = 'Barkod Okutunuz.';
    else if (this.formData.Dara == null || this.formData.Dara < 1) s = 'Dara bulunamadı.';
    else if (this.formData.Tonaj == null || this.formData.Tonaj < 1) s = 'Tonaj bulunamadı.';
    else if (this.formData.Tonaj < this.formData.Dara && this.formData.Tonaj > 1) s = 'Dara Tonajdan büyük olamaz.';
    return s;
  }
}



class DropdownProps {
  list: any[] = [];
  f_list: any[] = [];
  displayField: string = "";

  constructor(displayField = "", list = []) {
    this.displayField = displayField;
    this.list = list;
    this.f_list = list;
  }

  onChange(keyword) {
    this.f_list = this.list.filter((x) => x[this.displayField].includes(keyword.toUpperCase()));
  }


}